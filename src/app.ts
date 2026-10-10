// 主应用（无服务器版）
// 对应原项目 server/app.ts：Express → Hono，node:sqlite → D1，本地磁盘 → R2。

import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Env } from "./db.js";
import {
  contentSchema,
  referencedMedia,
  zonedDay,
  weatherLocationSchema,
  DEFAULT_ABOUT_BODY,
  DEFAULT_ABOUT,
  DEFAULT_CREDIT_TEXT,
  DEFAULT_LOCATION,
  DEFAULT_TEACHER,
  DEFAULT_COURSE,
  DEFAULT_CARD_ORDER,
  DEFAULT_CARD_BACKGROUNDS,
  sanitizeCardOrder,
  type HomeContent,
  type Stats,
} from "../shared/model.js";
import {
  HttpError,
  importAudio,
  importImage,
  serveMedia,
  detectUpload,
  deleteMedia,
} from "./media.js";
import { createSiteAuth, mountAuthRoutes, type SiteAuth } from "./auth.js";
import { mountEmail2faRoutes, isAdmin2faVerified } from "./email2fa.js";
import { createWeatherService } from "./weather.js";
import { createLocationSearch } from "./locations.js";
import { mountMessages } from "./messages.js";
import { rateLimit } from "./ratelimit.js";
import { ensureSchema, ensureSeeded } from "./db.js";
import { mountUserRoutes, mountUserThemeRoutes } from "./users.js";
import { mountStatsRoutes } from "./stats.js";
import { mountMemosRoutes } from "./memos.js";
import type { Context, Next } from "hono";

export interface AppBindings extends Env {}

type AppContext = Context<{ Bindings: AppBindings }>;

const VISITOR_COOKIE = "hejia-home-visitor";

// HMAC 密钥缓存（每个 secret 只 importKey 一次）
const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let p = keyCache.get(secret);
  if (!p) {
    p = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.set(secret, p);
  }
  return p;
}

async function signed(secret: string, id: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${id}.${hex}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readHome(db: D1Database): Promise<{ revision: number; content: HomeContent }> {
  const row = await db
    .prepare("SELECT revision,data FROM site_content WHERE id=1")
    .bind()
    .first<{ revision: number; data: string }>();
  if (!row) throw new Error("首页尚未初始化");
  const content = JSON.parse(String(row.data)) as HomeContent;
  content.theme ??= "fresh";
  content.profile.avatarId ??= null;
  content.profile.aboutBody ??= DEFAULT_ABOUT_BODY;
  content.profile.credit ??= DEFAULT_CREDIT_TEXT;
  content.social.xiaohongshu ??= "";
  content.social.bilibili ??= "";
  content.social.youtube ??= "";
  content.friends ??= [];
  // 老数据没有 events / resources 字段时补空数组（5 号卡线下共修 / 6 号卡资源分享站）
  content.events ??= [];
  content.resources ??= [];
  content.location ??= { ...DEFAULT_LOCATION };
  // 老数据没有 teacher 字段或为空对象时补默认值（新字段向后兼容；DEFAULT_TEACHER 自带真实师资种子）
  const t = content.teacher;
  if (!t?.name?.trim() && !t?.bio?.trim() && !(t?.credentials?.length)) {
    content.teacher = {
      ...DEFAULT_TEACHER,
      credentials: DEFAULT_TEACHER.credentials.map((c) => ({ ...c })),
    };
  }
  // 老数据没有 about 字段时补默认值（新字段向后兼容）
  content.about ??= {
    ...DEFAULT_ABOUT,
    services: DEFAULT_ABOUT.services.map((s) => ({ ...s })),
    contact: { ...DEFAULT_ABOUT.contact },
  };
  // 老数据没有 cardOrder 字段时补默认值并清洗
  content.cardOrder = sanitizeCardOrder(content.cardOrder ?? DEFAULT_CARD_ORDER);
  // 老数据没有 cardBackgrounds 字段时补空配置（null=内置默认图或无背景）
  content.cardBackgrounds ??= { ...DEFAULT_CARD_BACKGROUNDS };
  // 老数据没有 course 字段时补默认值（新字段向后兼容）
  content.course ??= {
    ...DEFAULT_COURSE,
    reviews: DEFAULT_COURSE.reviews.map((r) => ({ ...r })),
  };
  // 课程系列：老数据补空数组；老课时补 seriesId（空=按课程名回溯匹配系列）
  content.series ??= [];
  for (const t of content.tracks || []) t.seriesId ??= "";
  // 老课时没有 duration 字段时补 0（未知时长，前端不展示）
  for (const t of content.tracks || []) t.duration ??= 0;
  return { revision: row.revision, content };
}

function trustedOrigins(env: Env): string[] {
  const url = env.APP_URL || "";
  return url ? [url] : [];
}

/** 来源校验（对应原 originGuard）。 */
async function originGuard(c: AppContext, next: Next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const secFetchSite = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    const trusted = trustedOrigins(c.env);
    if (
      secFetchSite === "cross-site" ||
      (origin && !trusted.includes(origin))
    ) {
      return c.json({ error: "请求来源无效。" }, 403);
    }
  }
  await next();
}

/** 访客身份：HMAC 签名 Cookie，不存在则新建。 */
async function getVisitor(c: AppContext, secret: string, db: D1Database): Promise<string> {
  const raw = getCookie(c, VISITOR_COOKIE);
  if (raw && /^[\da-f-]{36}\.[\da-f]{64}$/.test(raw)) {
    const id = raw.slice(0, 36);
    const expected = await signed(secret, id);
    if (safeEqual(raw, expected)) {
      const exists = await db
        .prepare("SELECT id FROM visitors WHERE id=?")
        .bind(id)
        .first();
      if (exists) return id;
    }
  }
  const visitor = crypto.randomUUID();
  await db.prepare("INSERT INTO visitors(id) VALUES(?)").bind(visitor).run();
  setCookie(c, VISITOR_COOKIE, await signed(secret, visitor), {
    httpOnly: true,
    sameSite: "Lax",
    secure: (c.env.APP_URL || "").startsWith("https://"),
    path: "/api",
    maxAge: 365 * 86400,
  });
  return visitor;
}

async function stats(
  db: D1Database,
  visitor: string,
  timeZone: string,
): Promise<Stats> {
  const day = zonedDay(new Date(), timeZone);
  const startedRow = await db
    .prepare("SELECT value FROM settings WHERE key='startedAt'")
    .bind()
    .first<{ value: string }>();
  const started = String(startedRow?.value || new Date().toISOString());
  const todayVisitors = await db
    .prepare("SELECT COUNT(DISTINCT visitor_id) n FROM visits WHERE day=?")
    .bind(day)
    .first<{ n: number }>();
  const totalViews = await db
    .prepare("SELECT COUNT(*) n FROM visits")
    .bind()
    .first<{ n: number }>();
  const checkedIn = await db
    .prepare("SELECT 1 AS ok FROM checkins WHERE visitor_id=? AND day=?")
    .bind(visitor, day)
    .first();
  const checkins = await db
    .prepare("SELECT COUNT(*) n FROM checkins WHERE visitor_id=?")
    .bind(visitor)
    .first<{ n: number }>();
  const likeCount = await db
    .prepare("SELECT COUNT(*) n FROM likes")
    .bind()
    .first<{ n: number }>();
  const liked = await db
    .prepare("SELECT 1 AS ok FROM likes WHERE visitor_id=?")
    .bind(visitor)
    .first();
  return {
    todayVisitors: Number(todayVisitors?.n ?? 0),
    totalViews: Number(totalViews?.n ?? 0),
    daysOnline: Math.max(
      1,
      Math.floor(
        (Date.parse(day) - Date.parse(zonedDay(new Date(started), timeZone))) / 86400000,
      ) + 1,
    ),
    checkedIn: !!checkedIn,
    checkins: Number(checkins?.n ?? 0),
    likeCount: Number(likeCount?.n ?? 0),
    liked: !!liked,
  };
}

export function createApp(siteAuth: SiteAuth) {
  const app = new Hono<{ Bindings: AppBindings }>();

  // 全局错误处理（对应原 Express 错误中间件）
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.message }, err.status as 400);
    }
    console.error(err.message);
    return c.json({ error: "暂时无法完成，请稍后重试。" }, 500);
  });

  // 安全头
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  // /api 统一：禁用缓存 + 来源校验
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  app.use("/api/*", originGuard);

  // 每个请求确保 DB 就绪（幂等，开销极小）
  app.use("/api/*", async (c, next) => {
    await ensureSchema(c.env.DB);
    await ensureSeeded(c.env.DB);
    await next();
  });

  mountAuthRoutes(app, siteAuth);
  // 管理员邮箱两步验证（request-code / verify-code；requireAdmin 内部已加 2FA 门禁）
  mountEmail2faRoutes(app, siteAuth);

  const sessionUser = async (c: AppContext): Promise<{ id: string; isAdmin: boolean } | null> => {
    const data = await siteAuth.getSession(c);
    if (!data) return null;
    const admin = await c.env.DB
      .prepare('SELECT id FROM "user" ORDER BY rowid LIMIT 1')
      .bind()
      .first<{ id: string }>();
    return { id: data.user.id, isAdmin: !!admin && data.user.id === admin.id };
  };

  mountUserRoutes(app, siteAuth);
  mountUserThemeRoutes(app, sessionUser);
  mountStatsRoutes(app, siteAuth, sessionUser);
  mountMemosRoutes({ app, siteAuth, sessionUser });

  const secretOf = (c: AppContext) => c.env.AUTH_SECRET || "dev-secret-change-me";
  const visitorOf = (c: AppContext) => getVisitor(c, secretOf(c), c.env.DB);
  const siteTimeZone = async (c: AppContext) =>
    (await readHome(c.env.DB)).content.location.timeZone;

  app.get("/api/home", async (c) => {
    const home = await readHome(c.env.DB);
    c.header("Cache-Control", "public, max-age=0, must-revalidate");
    c.header("ETag", `"home-v5-${home.revision}"`);
    // 开源博客版：资源分享站链接对登录用户可见
    const session = await siteAuth.getSession(c);
    if (!session && home.content.resources.length) {
      home.content.resources = home.content.resources.map((r) => ({
        ...r,
        url: "",
        extractCode: "",
      }));
    }
    return c.json(home);
  });

  app.put("/api/home", siteAuth.requireAdmin, async (c) => {
    const body = await c.req.json().catch(() => null);
    const input = z
      .object({ revision: z.number().int().positive(), content: contentSchema })
      .safeParse(body);
    if (!input.success) {
      throw new HttpError(400, input.error.issues[0]?.message || "请检查内容格式。");
    }
    let refs: Map<string, "image" | "audio">;
    try {
      refs = referencedMedia(input.data.content);
    } catch {
      throw new HttpError(400, "素材类型不匹配。");
    }
    for (const [id, kind] of refs) {
      const m = await c.env.DB
        .prepare("SELECT kind FROM media WHERE id=?")
        .bind(id)
        .first<{ kind: string }>();
      if (!m || m.kind !== kind) {
        throw new HttpError(400, "部分素材已不存在或类型不正确，请重新选择。");
      }
    }
    const result = await c.env.DB
      .prepare("UPDATE site_content SET data=?,revision=revision+1 WHERE id=1 AND revision=?")
      .bind(JSON.stringify(input.data.content), input.data.revision)
      .run();
    if (!result.meta.changes) {
      throw new HttpError(
        409,
        "另一个窗口已更新首页。你的草稿仍在，请先取消编辑并重新载入，再重新应用修改。",
      );
    }
    return c.json(await readHome(c.env.DB));
  });

  app.get("/api/state", async (c) => {
    const visitor = await visitorOf(c);
    const session = await siteAuth.getSession(c);
    const su = await sessionUser(c);
    // 管理员 2FA：未通过邮箱验证码时，isAdmin 为 false 并提示 needs2fa
    const twoFaOk = su?.isAdmin
      ? await isAdmin2faVerified(c.env.DB, session?.session.token ?? null)
      : false;
    let userTheme: string | null = null;
    if (su?.id) {
      const row = await c.env.DB
        .prepare('SELECT theme FROM "user" WHERE id=?')
        .bind(su.id)
        .first<{ theme: string | null }>();
      userTheme = row?.theme ?? null;
    }
    return c.json({
      auth: {
        initialized: await siteAuth.initialized(c.env.DB),
        authenticated: !!session,
        ...(session ? { email: session.user.email } : {}),
        ...(su ? { isAdmin: su.isAdmin && twoFaOk } : {}),
        ...(su?.isAdmin && !twoFaOk ? { needs2fa: true } : {}),
        ...(userTheme ? { theme: userTheme } : {}),
      },
      stats: await stats(c.env.DB, visitor, await siteTimeZone(c)),
    });
  });

  app.get("/api/stats", async (c) => {
    const visitor = await visitorOf(c);
    return c.json(await stats(c.env.DB, visitor, await siteTimeZone(c)));
  });

  const actionLimiter = rateLimit({
    windowMs: 60000,
    limit: 90,
    message: "操作有点频繁，请稍后重试。",
  });

  app.post("/api/visits", actionLimiter, async (c) => {
    const visitor = await visitorOf(c);
    const body = await c.req.json().catch(() => null);
    const p = z.object({ pageViewId: z.string().uuid() }).safeParse(body);
    if (!p.success) throw new HttpError(400, "访问标识无效。");
    const session = await siteAuth.getSession(c);
    if (!session) {
      await c.env.DB
        .prepare("INSERT OR IGNORE INTO visits(id,visitor_id,day) VALUES(?,?,?)")
        .bind(p.data.pageViewId, visitor, zonedDay(new Date(), await siteTimeZone(c)))
        .run();
    }
    return c.json(await stats(c.env.DB, visitor, await siteTimeZone(c)));
  });

  app.post("/api/checkin", actionLimiter, async (c) => {
    const visitor = await visitorOf(c);
    await c.env.DB
      .prepare("INSERT OR IGNORE INTO checkins(visitor_id,day) VALUES(?,?)")
      .bind(visitor, zonedDay(new Date(), await siteTimeZone(c)))
      .run();
    return c.json(await stats(c.env.DB, visitor, await siteTimeZone(c)));
  });

  app.post("/api/likes", actionLimiter, async (c) => {
    const visitor = await visitorOf(c);
    const body = await c.req.json().catch(() => null);
    const parsed = z.object({ liked: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new HttpError(400, "点赞状态无效。");
    if (parsed.data.liked) {
      await c.env.DB
        .prepare("INSERT OR IGNORE INTO likes(visitor_id) VALUES(?)")
        .bind(visitor)
        .run();
    } else {
      await c.env.DB.prepare("DELETE FROM likes WHERE visitor_id=?").bind(visitor).run();
    }
    return c.json(await stats(c.env.DB, visitor, await siteTimeZone(c)));
  });

  const weatherService = createWeatherService();
  const locationSearch = createLocationSearch();

  app.get("/api/weather", async (c) => {
    const home = await readHome(c.env.DB);
    return c.json(await weatherService(home.content.location));
  });

  const locationLimiter = rateLimit({
    windowMs: 60000,
    limit: 30,
    message: "地点查询有点频繁，请稍后重试。",
  });

  app.get("/api/locations", siteAuth.requireAdmin, locationLimiter, async (c) => {
    const parsed = z.string().trim().min(2).max(80).safeParse(c.req.query("q"));
    if (!parsed.success) throw new HttpError(400, "请输入 2 至 80 个字的城市名称。");
    return c.json(await locationSearch(parsed.data));
  });

  app.post("/api/weather/preview", siteAuth.requireAdmin, locationLimiter, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = weatherLocationSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "请检查天气位置和时区。");
    return c.json(await weatherService(parsed.data));
  });

  mountMessages({
    app,
    requireAdmin: siteAuth.requireAdmin,
    getVisitor: visitorOf,
  });

  // 上传：Hono parseBody 替代 multer（50MB 上限）
  app.post("/api/media", siteAuth.requireAdmin, async (c) => {
    const kind = c.req.query("kind");
    if (!["image", "audio"].includes(String(kind))) {
      throw new HttpError(400, "请选择图片或音乐素材。");
    }
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!(file instanceof File)) throw new HttpError(400, "请选择文件。");
    if (file.size > 50 * 1024 * 1024) {
      throw new HttpError(400, "文件过大或上传无效，请使用 20 MB 以内图片或 50 MB 以内音频。");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = await detectUpload(bytes, {
      name: file.name,
      mime: file.type,
    });
    const imported =
      kind === "audio"
        ? await importAudio(c.env.DB, c.env.MEDIA, bytes, detected)
        : await importImage(c.env.DB, c.env.MEDIA, bytes, detected);
    return c.json(
      {
        id: imported.id,
        kind: imported.kind,
        url: `/api/media/${imported.id}`,
        ...(imported.duration ? { duration: imported.duration } : {}),
      },
      201,
    );
  });

  app.get("/api/media/:id", async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB
      .prepare("SELECT id FROM media WHERE id=?")
      .bind(id)
      .first();
    if (!row) throw new HttpError(404, "素材不存在。");
    const home = await readHome(c.env.DB);
    const publicMedia = referencedMedia(home.content);
    const isPublic = publicMedia.has(String(id));
    // 开源博客版：所有音频公开，无 VIP 限制
    if (!isPublic) {
      const session = await siteAuth.getSession(c);
      if (!session) throw new HttpError(404, "素材不存在。");
    }
    const wantThumb = c.req.query("size") === "thumb";
    return serveMedia(c.env.DB, c.env.MEDIA, isPublic, String(id), wantThumb);
  });

  // 删除媒体：仅管理员；仍被内容引用时拒绝删除，防止误删正在使用的文件
  app.delete("/api/media/:id", siteAuth.requireAdmin, async (c) => {
    const id = String(c.req.param("id"));
    const home = await readHome(c.env.DB);
    const refs = referencedMedia(home.content);
    if (refs.has(id)) {
      throw new HttpError(400, "该文件仍被内容引用，无法删除。");
    }
    await deleteMedia(c.env.DB, c.env.MEDIA, id);
    return c.json({ ok: true });
  });

  app.all("/api/*", (c) => c.json({ error: "接口不存在。" }, 404));

  return app;
}
