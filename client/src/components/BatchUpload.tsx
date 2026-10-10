import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Dialog } from "./Common";
import { request } from "../api";
import { useSite } from "../store";
import {
  type Track,
  type HomeContent,
} from "../../../shared/model";

type UploadStatus = "pending" | "uploading" | "done" | "error";
interface UploadItem {
  key: string;
  file: File;
  status: UploadStatus;
  message: string;
  mediaId?: string;
}
type SortMode = "name" | "picked";

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
const byFileName = (a: UploadItem, b: UploadItem) =>
  a.file.name.localeCompare(b.file.name, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
};
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 14,
};
const hintStyle: CSSProperties = { color: "var(--muted)", fontSize: 12 };
const segStyle: CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--line)",
  borderRadius: 999,
  overflow: "hidden",
};
const segBtn = (active: boolean): CSSProperties => ({
  border: 0,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
  background: active ? "var(--ink)" : "transparent",
  color: active ? "var(--paper)" : "var(--ink)",
});

export function BatchUploadDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { notify, saveContent, content } = useSite();
  const category = "music" as const;
  const isMusic = true;
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  // —— 批量设置 ——
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const inputRef = useRef<HTMLInputElement>(null);
  // items 的实时镜像：上传循环中按 key 读写，避免闭包拿到旧数组
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  // 生效顺序：按文件名排序 / 保持选择顺序（列表即按此顺序展示）
  const orderedItems = useMemo(
    () => (sortMode === "name" ? [...items].sort(byFileName) : items),
    [items, sortMode],
  );

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) =>
        !f.type ||
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name),
    );
    if (!list.length) {
      notify("没有可用的音频文件。");
      return;
    }
    setItems((prev) => [
      ...prev,
      ...list.map((file) => ({
        key: crypto.randomUUID(),
        file,
        status: "pending" as UploadStatus,
        message: "",
      })),
    ]);
    setDone(false);
  };

  const run = async () => {
    if (running || !orderedItems.length) return;
    if (!content) {
      notify("内容尚未加载，请稍后重试。");
      return;
    }
    setRunning(true);
    setDone(false);
    const order = orderedItems.map((it) => it.key);
    const setStatus = (key: string, patch: Partial<UploadItem>) =>
      setItems((prev) =>
        prev.map((i) => (i.key === key ? { ...i, ...patch } : i)),
      );
    const results: {
      key: string;
      file: File;
      mediaId: string;
      duration: number;
    }[] = [];
    for (const key of order) {
      const it = itemsRef.current.find((i) => i.key === key);
      if (!it || it.status === "done") continue;
      setStatus(key, { status: "uploading", message: "上传中…" });
      try {
        const data = new FormData();
        data.append("file", it.file);
        const res = await request<{ id: string; duration?: number }>(
          "/api/media?kind=audio",
          {
            method: "POST",
            body: data,
            timeout: 120000,
          },
        );
        setStatus(key, { status: "done", message: "成功", mediaId: res.id });
        results.push({
          key,
          file: it.file,
          mediaId: res.id,
          duration: res.duration ? Math.round(res.duration) : 0,
        });
      } catch (e) {
        setStatus(key, { status: "error", message: (e as Error).message });
      }
    }
    setRunning(false);
    if (!results.length) {
      notify("没有成功上传的文件。");
      return;
    }
    // 按生效顺序生成音乐曲目
    const byKey = new Map(results.map((r) => [r.key, r]));
    const newTracks: Track[] = [];
    order.forEach((key) => {
      const r = byKey.get(key);
      if (!r) return;
      newTracks.push({
        id: crypto.randomUUID(),
        title: stripExt(r.file.name) || "未命名音乐",
        artist: "",
        audioId: r.mediaId,
        coverId: null,
        demo: false,
        source: "",
        vip: false,
        category,
        course: "",
        seriesId: "",
        duration: r.duration,
      });
    });
    const newContent = {
      ...content,
      tracks: [...content.tracks, ...newTracks],
    } as HomeContent;
    try {
      await saveContent(newContent);
      setDone(true);
      notify(`已添加 ${newTracks.length} 首背景音乐。`);
    } catch (e) {
      notify(`已暂存，保存失败：${(e as Error).message}`);
    }
  };

  return (
    <Dialog
      title="批量上传音乐"
      eyebrow="UPLOAD"
      onClose={onClose}
    >
      <p className="theme-intro">
        选择多个音频文件，上传后自动生成背景音乐。
      </p>

      {/* —— 批量设置 —— */}
      <div style={{ display: "grid", gap: 12, margin: "12px 0" }}>

        <div style={labelStyle}>
          <span>课时顺序</span>
          <div>
            <div style={segStyle} role="radiogroup" aria-label="课时顺序">
              <button
                type="button"
                style={segBtn(sortMode === "name")}
                aria-pressed={sortMode === "name"}
                disabled={running}
                onClick={() => setSortMode("name")}
              >
                按文件名排序
              </button>
              <button
                type="button"
                style={segBtn(sortMode === "picked")}
                aria-pressed={sortMode === "picked"}
                disabled={running}
                onClick={() => setSortMode("picked")}
              >
                按选择顺序
              </button>
            </div>
          </div>
          <small style={hintStyle}>
            上传后按此顺序生成音乐；之后仍可在编辑器里拖拽调整。
          </small>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: "2px dashed var(--line)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            cursor: "pointer",
            color: "var(--muted)",
          }}
        >
          点击选择音频文件（可多选）
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {orderedItems.length > 0 && (
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gap: 6,
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {orderedItems.map((it, i) => (
            <li
              key={it.key}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 13,
                padding: "6px 8px",
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {it.file.name}
              </span>
              <span style={{ color: "var(--muted)" }}>
                {it.status === "done"
                  ? "✓"
                  : it.status === "error"
                    ? `✗ ${it.message}`
                    : it.status === "uploading"
                      ? "…"
                      : "待"}
              </span>
            </li>
          ))}
        </ol>
      )}

      {done && (
        <p style={{ color: "var(--theme-focus)", fontSize: 14 }}>
          {isMusic
            ? "✓ 音乐已添加，悬浮播放器已更新。"
            : "✓ 课时已添加到冥想课程，首页已更新。"}
        </p>
      )}
      <div className="theme-dialog-footer">
        <button type="button" className="button" onClick={onClose}>
          关闭
        </button>
        <button
          type="button"
          className="button dark"
          disabled={running || !items.length || done}
          onClick={() => void run()}
        >
          {running ? "上传中…" : done ? "✓ 已上传" : `开始上传（${items.length}）`}
        </button>
      </div>
    </Dialog>
  );
}
