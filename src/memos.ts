// 会员社区（memos 风格）：动态、回复、表情回应、按人审核开关
// 公开时间线 + 登录发帖/回复/表情；管理员可审核、删帖、设按人审核。

import { z } from "zod";
import { HttpError } from "./media.js";
import { rateLimit } from "./ratelimit.js";
import type { Context } from "hono";
import type { Env } from "./db.js";
import type { SiteAuth } from "./auth.js";
type SessionUser = { id: string; isAdmin: boolean };

type Ctx = Context<{ Bindings: Env }>;

interface Deps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any;
  siteAuth: SiteAuth;
  sessionUser: (c: Ctx) => Promise<SessionUser | null>;
}

// 表情白名单
const EMOJIS = ["👍", "❤️", "🙏", "😄", "😮", "🎉"] as const;

const memoSchema = z.object({
  content: z.string().trim().min(1, "写点什么再发布吧。").max(1000, "动态最多 1000 字。"),
});
const replySchema = z.object({
  content: z.string().trim().min(1, "写点什么再回复吧。").max(500, "回复最多 500 字。"),
});
const reactSchema = z.object({
  emoji: z.enum(EMOJIS as unknown as [string, ...string[]], { message: "请选择有效的表情。" }),
});

interface MemoRow {
  id: string;
  user_id: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  author_name: string;
}

async function authorName(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare('SELECT name FROM "user" WHERE id=?')
    .bind(userId)
    .first<{ name: string }>();
  return row?.name || "无名氏";
}

// 聚合某批动态的回复数与表情汇总（一次 GROUP BY，避免 N+1）
async function enrichMemos(db: D1Database, memos: MemoRow[], viewerId: string | null) {
  if (!memos.length) return [];
  const ids = memos.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const replyCounts = await db
    .prepare(
      `SELECT memo_id, COUNT(*) n FROM memo_replies WHERE memo_id IN (${placeholders}) GROUP BY memo_id`,
    )
    .bind(...ids)
    .all<{ memo_id: string; n: number }>();
  const reactionSums = await db
    .prepare(
      `SELECT memo_id, emoji, COUNT(*) n FROM memo_reactions WHERE memo_id IN (${placeholders}) GROUP BY memo_id, emoji`,
    )
    .bind(...ids)
    .all<{ memo_id: string; emoji: string; n: number }>();
  let mine: Set<string> = new Set();
  if (viewerId) {
    const myReactions = await db
      .prepare(
        `SELECT memo_id, emoji FROM memo_reactions WHERE memo_id IN (${placeholders}) AND user_id=?`,
      )
      .bind(...ids, viewerId)
      .all<{ memo_id: string; emoji: string }>();
    mine = new Set((myReactions.results ?? []).map((r) => `${r.memo_id}:${r.emoji}`));
  }
  const replyMap = new Map((replyCounts.results ?? []).map((r) => [r.memo_id, Number(r.n)]));
  const reactionMap = new Map<string, { emoji: string; count: number; reacted: boolean }[]>();
  for (const r of reactionSums.results ?? []) {
    const list = reactionMap.get(r.memo_id) ?? [];
    list.push({
      emoji: r.emoji,
      count: Number(r.n),
      reacted: mine.has(`${r.memo_id}:${r.emoji}`),
    });
    reactionMap.set(r.memo_id, list);
  }
  return memos.map((m) => ({
    id: m.id,
    content: m.content,
    status: m.status,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    author: { id: m.user_id, name: m.author_name },
    replyCount: replyMap.get(m.id) ?? 0,
    reactions: reactionMap.get(m.id) ?? [],
  }));
}

export function mountMemosRoutes({ app, siteAuth, sessionUser }: Deps) {
  const postLimiter = rateLimit({
    windowMs: 60000,
    limit: 5,
    message: "发布有点频繁，请稍后再试。",
  });
  const actionLimiter = rateLimit({
    windowMs: 60000,
    limit: 60,
    message: "操作有点频繁，请稍后重试。",
  });

  // 时间线（公开）：只返回已审核，按时间倒序，cursor 分页
  app.get("/api/memos", async (c: Ctx) => {
    const db: D1Database = c.env.DB;
    const limit = z.coerce.number().int().min(1).max(50).safeParse(c.req.query("limit") || 20);
    const cursor = c.req.query("cursor") || null;
    const su = await sessionUser(c);
    let sql = `SELECT m.id,m.user_id,m.content,m.status,m.created_at,m.updated_at,u.name AS author_name
      FROM memos m LEFT JOIN "user" u ON u.id=m.user_id
      WHERE m.status='approved'`;
    const binds: string[] = [];
    if (cursor) {
      sql += ` AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))`;
      // cursor 格式：created_at|id
      const [ts, mid] = String(cursor).split("|");
      binds.push(ts, ts, mid);
    }
    sql += ` ORDER BY m.created_at DESC, m.id DESC LIMIT ?`;
    binds.push(String(limit.success ? limit.data : 20));
    const { results } = await db.prepare(sql).bind(...binds).all<MemoRow>();
    const memos = await enrichMemos(db, results ?? [], su?.id ?? null);
    const last = memos[memos.length - 1];
    return c.json({
      memos,
      nextCursor: last ? `${last.createdAt}|${last.id}` : null,
    });
  });

  // 发动态（需登录）
  app.post("/api/memos", postLimiter, async (c: Ctx) => {
    const su = await sessionUser(c);
    if (!su) throw new HttpError(401, "请先登录再发布。");
    const body = await c.req.json().catch(() => null);
    const input = memoSchema.safeParse(body);
    if (!input.success) throw new HttpError(400, input.error.issues[0]?.message || "请检查动态内容。");
    const db: D1Database = c.env.DB;
    const me = await db
      .prepare('SELECT require_review FROM "user" WHERE id=?')
      .bind(su.id)
      .first<{ require_review: number }>();
    const needReview = Number(me?.require_review ?? 0) === 1;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO memos(id,user_id,content,status,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .bind(id, su.id, input.data.content, needReview ? "pending" : "approved", now, now)
      .run();
    return c.json({ id, pending: needReview }, 201);
  });

  // 删动态（本人或管理员）
  app.delete("/api/memos/:id", actionLimiter, async (c: Ctx) => {
    const su = await sessionUser(c);
    if (!su) throw new HttpError(401, "请先登录。");
    const db: D1Database = c.env.DB;
    const memo = await db
      .prepare("SELECT user_id FROM memos WHERE id=?")
      .bind(c.req.param("id"))
      .first<{ user_id: string }>();
    if (!memo) throw new HttpError(404, "这条动态已不存在。");
    if (memo.user_id !== su.id && !su.isAdmin) throw new HttpError(403, "只能删除自己的动态。");
    await db.batch([
      db.prepare("DELETE FROM memo_reactions WHERE memo_id=?").bind(c.req.param("id")),
      db.prepare("DELETE FROM memo_replies WHERE memo_id=?").bind(c.req.param("id")),
      db.prepare("DELETE FROM memos WHERE id=?").bind(c.req.param("id")),
    ]);
    return c.json({ deleted: true });
  });

  // 待审核列表（管理员）
  app.get("/api/memos/pending", siteAuth.requireAdmin, async (c: Ctx) => {
    const db: D1Database = c.env.DB;
    const { results } = await db
      .prepare(
        `SELECT m.id,m.user_id,m.content,m.status,m.created_at,m.updated_at,u.name AS author_name
         FROM memos m LEFT JOIN "user" u ON u.id=m.user_id
         WHERE m.status='pending' ORDER BY m.created_at DESC, m.id DESC LIMIT 100`,
      )
      .bind()
      .all<MemoRow>();
    return c.json({ memos: await enrichMemos(db, results ?? [], null) });
  });

  // 审核通过 / 驳回（管理员）
  const reviewOne = async (c: Ctx, status: "approved" | "rejected") => {
    const db: D1Database = c.env.DB;
    const result = await db
      .prepare("UPDATE memos SET status=?,updated_at=? WHERE id=? AND status='pending'")
      .bind(status, new Date().toISOString(), c.req.param("id"))
      .run();
    if (!result.meta.changes) throw new HttpError(404, "这条动态不在待审核列表。");
    return c.json({ updated: true, status });
  };
  app.post("/api/memos/:id/approve", siteAuth.requireAdmin, (c: Ctx) => reviewOne(c, "approved"));
  app.post("/api/memos/:id/reject", siteAuth.requireAdmin, (c: Ctx) => reviewOne(c, "rejected"));

  // 回复列表（公开）
  app.get("/api/memos/:id/replies", async (c: Ctx) => {
    const db: D1Database = c.env.DB;
    const memo = await db
      .prepare("SELECT id FROM memos WHERE id=? AND status='approved'")
      .bind(c.req.param("id"))
      .first();
    if (!memo) throw new HttpError(404, "这条动态已不存在。");
    const { results } = await db
      .prepare(
        `SELECT r.id,r.user_id,r.content,r.created_at,u.name AS author_name
         FROM memo_replies r LEFT JOIN "user" u ON u.id=r.user_id
         WHERE r.memo_id=? ORDER BY r.created_at ASC, r.id ASC LIMIT 200`,
      )
      .bind(c.req.param("id"))
      .all<{ id: string; user_id: string; content: string; created_at: string; author_name: string }>();
    return c.json({
      replies: (results ?? []).map((r) => ({
        id: r.id,
        content: r.content,
        createdAt: r.created_at,
        author: { id: r.user_id, name: r.author_name || "无名氏" },
      })),
    });
  });

  // 回复（需登录；回复直接显示，不走审核）
  app.post("/api/memos/:id/replies", postLimiter, async (c: Ctx) => {
    const su = await sessionUser(c);
    if (!su) throw new HttpError(401, "请先登录再回复。");
    const body = await c.req.json().catch(() => null);
    const input = replySchema.safeParse(body);
    if (!input.success) throw new HttpError(400, input.error.issues[0]?.message || "请检查回复内容。");
    const db: D1Database = c.env.DB;
    const memo = await db
      .prepare("SELECT id FROM memos WHERE id=? AND status='approved'")
      .bind(c.req.param("id"))
      .first();
    if (!memo) throw new HttpError(404, "这条动态已不存在。");
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO memo_replies(id,memo_id,user_id,content,created_at) VALUES(?,?,?,?,?)")
      .bind(id, c.req.param("id"), su.id, input.data.content, new Date().toISOString())
      .run();
    return c.json({ id, author: { id: su.id, name: await authorName(db, su.id) } }, 201);
  });

  // 删回复（本人或管理员）
  app.delete("/api/memos/replies/:replyId", actionLimiter, async (c: Ctx) => {
    const su = await sessionUser(c);
    if (!su) throw new HttpError(401, "请先登录。");
    const db: D1Database = c.env.DB;
    const reply = await db
      .prepare("SELECT user_id FROM memo_replies WHERE id=?")
      .bind(c.req.param("replyId"))
      .first<{ user_id: string }>();
    if (!reply) throw new HttpError(404, "这条回复已不存在。");
    if (reply.user_id !== su.id && !su.isAdmin) throw new HttpError(403, "只能删除自己的回复。");
    await db.prepare("DELETE FROM memo_replies WHERE id=?").bind(c.req.param("replyId")).run();
    return c.json({ deleted: true });
  });

  // 表情回应（需登录；toggle）
  app.post("/api/memos/:id/react", actionLimiter, async (c: Ctx) => {
    const su = await sessionUser(c);
    if (!su) throw new HttpError(401, "请先登录再互动。");
    const body = await c.req.json().catch(() => null);
    const input = reactSchema.safeParse(body);
    if (!input.success) throw new HttpError(400, input.error.issues[0]?.message || "请选择有效的表情。");
    const db: D1Database = c.env.DB;
    const memo = await db
      .prepare("SELECT id FROM memos WHERE id=? AND status='approved'")
      .bind(c.req.param("id"))
      .first();
    if (!memo) throw new HttpError(404, "这条动态已不存在。");
    const existed = await db
      .prepare("SELECT 1 AS ok FROM memo_reactions WHERE memo_id=? AND user_id=? AND emoji=?")
      .bind(c.req.param("id"), su.id, input.data.emoji)
      .first();
    if (existed) {
      await db
        .prepare("DELETE FROM memo_reactions WHERE memo_id=? AND user_id=? AND emoji=?")
        .bind(c.req.param("id"), su.id, input.data.emoji)
        .run();
      return c.json({ reacted: false });
    }
    await db
      .prepare("INSERT INTO memo_reactions(memo_id,user_id,emoji,created_at) VALUES(?,?,?,?)")
      .bind(c.req.param("id"), su.id, input.data.emoji, new Date().toISOString())
      .run();
    return c.json({ reacted: true });
  });

  // 当前登录用户信息（含 require_review，供发帖提示用）
  app.get("/api/user/me", async (c: Ctx) => {
    const su = await sessionUser(c);
    if (!su) throw new HttpError(401, "请先登录。");
    const db: D1Database = c.env.DB;
    const row = await db
      .prepare('SELECT id,name,email,require_review FROM "user" WHERE id=?')
      .bind(su.id)
      .first<{ id: string; name: string; email: string; require_review: number }>();
    if (!row) throw new HttpError(404, "用户不存在。");
    // 会员状态（vip_source 列由 0014 迁移添加；未应用时降级只读有效期）
    let vipExpiresAt: number | null = null;
    let vipSource: string | null = null;
    try {
      const v = await db
        .prepare('SELECT vipExpiresAt, vip_source FROM "user" WHERE id=?')
        .bind(su.id)
        .first<{ vipExpiresAt: number | null; vip_source: string | null }>();
      vipExpiresAt = v?.vipExpiresAt ?? null;
      vipSource = v?.vip_source ?? null;
    } catch {
      const v = await db
        .prepare('SELECT vipExpiresAt FROM "user" WHERE id=?')
        .bind(su.id)
        .first<{ vipExpiresAt: number | null }>()
        .catch(() => null);
      vipExpiresAt = v?.vipExpiresAt ?? null;
    }
    const vipDaysLeft =
      typeof vipExpiresAt === "number" && vipExpiresAt > Date.now()
        ? Math.ceil((vipExpiresAt - Date.now()) / 86_400_000)
        : 0;
    return c.json({
      id: row.id,
      name: row.name,
      email: row.email,
      isAdmin: su.isAdmin,
      requireReview: Number(row.require_review ?? 0) === 1,
      vipExpiresAt,
      vipSource,
      vipDaysLeft,
    });
  });

  // 管理员：设置某会员是否需要审核
  app.patch("/api/admin/users/:userId/review", siteAuth.requireAdmin, async (c: Ctx) => {
    const body = await c.req.json().catch(() => null);
    const input = z.object({ require_review: z.union([z.literal(0), z.literal(1)]) }).safeParse(body);
    if (!input.success) throw new HttpError(400, "参数无效。");
    const db: D1Database = c.env.DB;
    const result = await db
      .prepare('UPDATE "user" SET require_review=? WHERE id=?')
      .bind(input.data.require_review, c.req.param("userId"))
      .run();
    if (!result.meta.changes) throw new HttpError(404, "用户不存在。");
    return c.json({ updated: true });
  });
}
