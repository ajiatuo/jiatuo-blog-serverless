// 媒体处理（无服务器版）
// 对应原项目 server/media.ts。
// Workers 无 sharp / FFmpeg / 本地磁盘，因此：
// - 图片：原样存入 R2（不转码、不生成缩略图；?size=thumb 直接返回原图）
// - 音频：music-metadata 解析时长与内嵌封面（纯 JS，Workers 兼容）；
//   跳过 FFmpeg 完整解码校验（Worker 内无法运行），保留时长/声道/视频轨检查。
// - 文件全部存 R2，DB 只存 R2 key。

import { fileTypeFromBuffer } from "file-type";
import { parseBuffer } from "music-metadata";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/x-aac",
  "video/mp4",
];

export interface ImportedMedia {
  id: string;
  kind: "image" | "audio";
  duration?: number;
}

/** 最小图片尺寸解析（JPEG/PNG/WebP），失败返回 null。 */
function parseImageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  try {
    if (mime === "image/png" && bytes.length > 24) {
      const w =
        (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const h =
        (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      if (w > 0 && h > 0 && w < 100000 && h < 100000) return { width: w, height: h };
    } else if (mime === "image/jpeg" && bytes.length > 4) {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) break;
        const marker = bytes[i + 1];
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = (bytes[i + 5] << 8) | bytes[i + 6];
          const w = (bytes[i + 7] << 8) | bytes[i + 8];
          if (w > 0 && h > 0) return { width: w, height: h };
        }
        i += 2 + len;
      }
    } else if (mime === "image/webp" && bytes.length > 30) {
      const riff = String.fromCharCode(...bytes.slice(0, 4));
      const fmt = String.fromCharCode(...bytes.slice(8, 12));
      if (riff === "RIFF" && fmt === "WEBP") {
        const chunk = String.fromCharCode(...bytes.slice(12, 16));
        if (chunk === "VP8 " && bytes.length > 30) {
          const w = bytes[26] | (bytes[27] << 8);
          const h = bytes[28] | (bytes[29] << 8);
          if (w > 0 && h > 0) return { width: w, height: h };
        } else if (chunk === "VP8L" && bytes.length > 25) {
          const b = bytes.slice(21, 25);
          const w = 1 + (((b[1] & 0x3f) << 8) | b[0]);
          const h = 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
          if (w > 0 && h > 0) return { width: w, height: h };
        } else if (chunk === "VP8X" && bytes.length > 30) {
          const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
          const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
          if (w > 0 && h > 0) return { width: w, height: h };
        }
      }
    }
  } catch {
    // 解析失败 → null
  }
  return null;
}

function extFor(mime: string, kind: "image" | "audio"): string {
  if (kind === "image") {
    return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  }
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac"))
    return "m4a";
  return "mp3";
}

export async function importImage(
  db: D1Database,
  bucket: R2Bucket,
  bytes: Uint8Array,
  detectedMime: string,
): Promise<ImportedMedia> {
  if (!IMAGE_MIMES.includes(detectedMime)) {
    throw new HttpError(400, "照片仅支持 JPEG、PNG 或 WebP，请选择有效图片。");
  }
  if (bytes.length > 20 * 1024 * 1024) {
    throw new HttpError(400, "图片不能超过 20 MB。");
  }
  const dims = parseImageDimensions(bytes, detectedMime);
  if (dims && dims.width * dims.height > 40_000_000) {
    throw new HttpError(400, "图片无法解码或尺寸过大，请更换文件。");
  }
  const id = crypto.randomUUID();
  const key = `media/${id}.${extFor(detectedMime, "image")}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: detectedMime } });
  try {
    await db
      .prepare(
        "INSERT INTO media(id,kind,filename,thumb,mime,width,height) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        "image",
        key,
        "",
        detectedMime,
        dims?.width ?? null,
        dims?.height ?? null,
      )
      .run();
  } catch {
    await bucket.delete(key).catch(() => {});
    throw new HttpError(400, "图片无法解码或尺寸过大，请更换文件。");
  }
  return { id, kind: "image" };
}

export async function importAudio(
  db: D1Database,
  bucket: R2Bucket,
  bytes: Uint8Array,
  detectedMime: string,
): Promise<ImportedMedia> {
  if (!AUDIO_MIMES.includes(detectedMime)) {
    throw new HttpError(400, "音乐仅支持有效的 MP3、M4A 或 WAV 文件。");
  }
  let duration = 0;
  let coverKey = "";
  let coverMime = "";
  try {
    const metadata = await parseBuffer(Buffer.from(bytes), {
      mimeType: detectedMime,
      size: bytes.length,
    });
    duration = metadata.format.duration || 0;
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 1800 ||
      !metadata.format.numberOfChannels ||
      metadata.format.hasVideo
    ) {
      throw new Error("invalid duration");
    }
    // 内嵌封面：原样存入 R2（不做 sharp 缩放）
    const pictures = [...(metadata.common.picture || [])].sort(
      (a, b) => Number(b.type === "Cover (front)") - Number(a.type === "Cover (front)"),
    );
    for (const pic of pictures) {
      if (!pic.data.length || pic.data.length > 10 * 1024 * 1024) continue;
      const fmt = await fileTypeFromBuffer(pic.data);
      if (!fmt || !IMAGE_MIMES.includes(fmt.mime)) continue;
      const id = crypto.randomUUID();
      coverKey = `media/${id}-cover.${extFor(fmt.mime, "image")}`;
      coverMime = fmt.mime;
      await bucket.put(coverKey, pic.data, {
        httpMetadata: { contentType: fmt.mime },
      });
      break;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "音频无法完整解码或超过 30 分钟，请更换文件。");
  }
  const id = crypto.randomUUID();
  const ext = extFor(detectedMime, "audio");
  const key = `media/${id}.${ext}`;
  const mime =
    ext === "m4a" ? "audio/mp4" : ext === "wav" ? "audio/wav" : "audio/mpeg";
  await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
  try {
    await db
      .prepare(
        "INSERT INTO media(id,kind,filename,mime,duration,thumb) VALUES(?,?,?,?,?,?)",
      )
      .bind(id, "audio", key, mime, duration, coverKey)
      .run();
  } catch {
    await bucket.delete(key).catch(() => {});
    if (coverKey) await bucket.delete(coverKey).catch(() => {});
    throw new HttpError(400, "音频保存失败，请重试。");
  }
  void coverMime;
  return { id, kind: "audio", duration };
}

export interface MediaRow {
  id: string;
  kind: string;
  filename: string;
  thumb: string | null;
  mime: string;
}

/** 删除媒体：同时清 R2 文件和 D1 记录（含音频内嵌封面）。不存在时静默返回 true。 */
export async function deleteMedia(
  db: D1Database,
  bucket: R2Bucket,
  id: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id,filename,thumb FROM media WHERE id=?")
    .bind(id)
    .first<{ id: string; filename: string; thumb: string | null }>();
  if (!row) return true;
  await bucket.delete(row.filename).catch(() => {});
  if (row.thumb) await bucket.delete(row.thumb).catch(() => {});
  await db.prepare("DELETE FROM media WHERE id=?").bind(id).run();
  return true;
}

/** 从 R2 取文件并返回 Response（含缓存头）。 */
export async function serveMedia(
  db: D1Database,
  bucket: R2Bucket,
  isPublic: boolean,
  id: string,
  wantThumb: boolean,
): Promise<Response> {
  const row = await db
    .prepare("SELECT id,kind,filename,thumb,mime FROM media WHERE id=?")
    .bind(id)
    .first<MediaRow>();
  if (!row) throw new HttpError(404, "素材不存在。");

  let key = row.filename;
  let contentType = row.mime;
  if (wantThumb) {
    if (row.kind === "audio") {
      if (!row.thumb) throw new HttpError(404, "这首音乐没有内嵌封面。");
      key = row.thumb;
      // 封面原样存储，按扩展名判断类型
      contentType = key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    }
    // 图片：无服务器版不生成缩略图，直接返回原图
  }

  const obj = await bucket.get(key);
  if (!obj) throw new HttpError(404, "素材不存在。");
  return new Response(obj.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": isPublic
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    },
  });
}

/**
 * 上传入口：先用 file-type 从文件头识别；识别失败时用浏览器上报的 MIME
 * 或文件名后缀兜底（iPhone 部分 M4A/AAC 头部特殊，file-type 可能认不出）。
 * 安全由 music-metadata 实际解析音频帧保证：伪装文件会在 importAudio/
 * importImage 的解码校验中被拒绝，不会仅凭后缀放行。
 */
export async function detectUpload(
  bytes: Uint8Array,
  fallback?: { name?: string; mime?: string },
): Promise<string> {
  const type = await fileTypeFromBuffer(bytes);
  if (type) return type.mime;
  const browserMime = fallback?.mime?.toLowerCase().split(";")[0].trim();
  if (
    browserMime &&
    (AUDIO_MIMES.includes(browserMime) || IMAGE_MIMES.includes(browserMime))
  ) {
    return browserMime;
  }
  const ext = fallback?.name?.toLowerCase().split(".").pop();
  const extMime: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  if (ext && extMime[ext]) return extMime[ext];
  throw new HttpError(400, "无法识别文件类型，请选择有效文件。");
}
