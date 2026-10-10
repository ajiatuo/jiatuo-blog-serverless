// 付费账号后台管理（无服务器版新增）
// 仅管理员：用户列表 + VIP 有效期开通 / 续费 / 取消。
// 用户自己没有任何途径写 vipExpiresAt（注册时 additionalFields input:false，
// 且没有面向普通用户的写入接口）。
//
// 另含会员个人主题（/api/user/theme）：登录会员自选主题，仅改变自己看到的样式。

import { z } from "zod";
import type { Context } from "hono";
import type { Env } from "./db.js";
import type { SiteAuth } from "./auth.js";
import { HttpError } from "./media.js";
import { siteThemeSchema } from "../shared/model.js";
type SessionUser = { id: string; isAdmin: boolean };

type Ctx = Context<{ Bindings: Env }>;

/** 管理员 = user 表第一条记录（rowid 最小）。 */
async function adminId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM "user" ORDER BY rowid LIMIT 1')
    .bind()
    .first<{ id: string }>();
  return row?.id ?? null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  vipExpiresAt: number | null;
  createdAt: string;
  isAdmin: boolean;
  requireReview: boolean;
}

export function mountUserRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  siteAuth: SiteAuth,
) {
  // 用户列表（注册时间倒序）
  app.get("/api/admin/users", siteAuth.requireAdmin, async (c: Ctx) => {
    const db: D1Database = c.env.DB;
    const aid = await adminId(db);
    const res = await db
      .prepare(
        'SELECT id, name, email, vipExpiresAt, createdAt, require_review FROM "user" ORDER BY rowid DESC',
      )
      .bind()
      .all<{
        id: string;
        name: string;
        email: string;
        vipExpiresAt: number | null;
        createdAt: string;
        require_review: number | null;
      }>();
    const users: AdminUserRow[] = (res.results ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      vipExpiresAt: u.vipExpiresAt ?? null,
      createdAt: u.createdAt,
      isAdmin: u.id === aid,
      requireReview: Number(u.require_review ?? 0) === 1,
    }));
    return c.json({ users });
  });

  // 设置某用户的 VIP 有效期：ISO 时间字符串；null = 取消 VIP
  app.post("/api/admin/users/:id/vip", siteAuth.requireAdmin, async (c: Ctx) => {
    const db: D1Database = c.env.DB;
    const id = c.req.param("id");
    const aid = await adminId(db);
    if (!id || id === aid) {
      return c.json({ error: "不能修改管理员账号的 VIP 状态。" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const input = z.object({ expiresAt: z.string().nullable() }).safeParse(body);
    if (!input.success) {
      return c.json({ error: "参数无效。" }, 400);
    }
    let expiresMs: number | null = null;
    if (input.data.expiresAt !== null) {
      expiresMs = Date.parse(input.data.expiresAt);
      if (!Number.isFinite(expiresMs)) {
        return c.json({ error: "有效期格式无效。" }, 400);
      }
    }
    const target = await db
      .prepare('SELECT id FROM "user" WHERE id=?')
      .bind(id)
      .first();
    if (!target) {
      return c.json({ error: "用户不存在。" }, 404);
    }
    try {
      await db
        .prepare('UPDATE "user" SET vipExpiresAt=?, vip_source=? WHERE id=?')
        .bind(expiresMs, "admin", id)
        .run();
    } catch {
      // 0014 迁移未应用时降级：只写有效期
      await db
        .prepare('UPDATE "user" SET vipExpiresAt=? WHERE id=?')
        .bind(expiresMs, id)
        .run();
    }
    return c.json({ ok: true, vipExpiresAt: expiresMs });
  });

  // 删除用户（管理员）：
  //  - 管理员账号（全站唯一管理员）不可删除 —— 同时覆盖了"不能删自己"和"不能删最后一个管理员"，
  //    因为 requireAdmin 已保证调用者就是该管理员。
  //  - 有财务意义的订单（已支付 PAID / 待确认 PENDING / 已下单 CREATED）不可删除，保财务数据。
  //  - 无订单或只有已驳回（REJECTED）订单的用户：级联删除其相关记录后再删用户。
  app.delete("/api/admin/users/:id", siteAuth.requireAdmin, async (c: Ctx) => {
    const db: D1Database = c.env.DB;
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "参数无效。" }, 400);
    }
    const aid = await adminId(db);
    if (id === aid) {
      return c.json({ error: "不能删除管理员账号。" }, 400);
    }
    const target = await db
      .prepare('SELECT id FROM "user" WHERE id=?')
      .bind(id)
      .first();
    if (!target) {
      return c.json({ error: "用户不存在。" }, 404);
    }
    const blocked = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM pay_orders WHERE user_id=? AND status IN ('PAID','PENDING','CREATED')",
      )
      .bind(id)
      .first<{ n: number }>();
    if (Number(blocked?.n) > 0) {
      return c.json({ error: "该用户有订单记录，不能删除。" }, 400);
    }
    // 级联删除：社区动态及相关回复/表情先清（避免孤儿数据），
    // 再清学习进度、冥想统计、登录日志、验证码、剩余订单，最后删用户。
    // session/account 表声明了 ON DELETE CASCADE，但 D1 不保证外键强制，显式删除。
    await db.batch([
      db
        .prepare(
          "DELETE FROM memo_reactions WHERE memo_id IN (SELECT id FROM memos WHERE user_id=?)",
        )
        .bind(id),
      db
        .prepare(
          "DELETE FROM memo_replies WHERE memo_id IN (SELECT id FROM memos WHERE user_id=?)",
        )
        .bind(id),
      db.prepare("DELETE FROM memos WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM memo_reactions WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM memo_replies WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM lesson_progress WHERE userId=?").bind(id),
      db.prepare("DELETE FROM meditation_stats WHERE userId=?").bind(id),
      db.prepare("DELETE FROM login_logs WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM email_codes WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM pay_orders WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM session WHERE userId=?").bind(id),
      db.prepare("DELETE FROM account WHERE userId=?").bind(id),
      db.prepare('DELETE FROM "user" WHERE id=?').bind(id),
    ]);
    return c.json({ ok: true });
  });
}

/**
 * 会员个人主题：登录会员自选主题，仅改变自己看到的样式。
 * 仅 VIP 有效期内会员或管理员可用；theme=null 表示恢复跟随全站默认。
 */
export function mountUserThemeRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  getSessionUser: (c: Ctx) => Promise<SessionUser | null>,
) {
  const requireLogin = async (c: Ctx): Promise<SessionUser> => {
    const u = await getSessionUser(c);
    if (!u?.id) throw new HttpError(401, "请先登录。");
    return u;
  };

  const requireVipMember = async (
    c: Ctx,
    u: SessionUser,
  ): Promise<void> => {
    if (u.isAdmin) return;
    const db: D1Database = c.env.DB;
    const row = await db
      .prepare('SELECT vipExpiresAt FROM "user" WHERE id=?')
      .bind(u.id)
      .first<{ vipExpiresAt: number | null }>();
    const exp = row?.vipExpiresAt;
    if (!(typeof exp === "number" && exp > Date.now())) {
      throw new HttpError(403, "会员专享功能，开通会员后可用。");
    }
  };

  // 我的主题
  app.get("/api/user/theme", async (c: Ctx) => {
    const u = await requireLogin(c);
    const db: D1Database = c.env.DB;
    const row = await db
      .prepare('SELECT theme FROM "user" WHERE id=?')
      .bind(u.id)
      .first<{ theme: string | null }>();
    return c.json({ theme: row?.theme ?? null });
  });

  // 设置我的主题（null = 恢复跟随全站默认）
  app.post("/api/user/theme", async (c: Ctx) => {
    const u = await requireLogin(c);
    await requireVipMember(c, u);
    const body = await c.req.json().catch(() => null);
    const input = z.object({ theme: z.string().nullable() }).safeParse(body);
    if (!input.success) {
      return c.json({ error: "参数无效。" }, 400);
    }
    if (
      input.data.theme !== null &&
      !siteThemeSchema.safeParse(input.data.theme).success
    ) {
      return c.json({ error: "主题不存在。" }, 400);
    }
    const db: D1Database = c.env.DB;
    await db
      .prepare('UPDATE "user" SET theme=? WHERE id=?')
      .bind(input.data.theme, u.id)
      .run();
    return c.json({ ok: true, theme: input.data.theme });
  });
}
