// 私密留言（无服务器版）
// 对应原项目 server/messages.ts：D1 异步化。

import { z } from "zod";
import { messageSchema } from "../shared/model.js";
import { HttpError } from "./media.js";
import { rateLimit } from "./ratelimit.js";
import type { Context } from "hono";
import type { Env } from "./db.js";

type Ctx = Context<{ Bindings: Env }>;

interface Deps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any;
  requireAdmin: (c: Ctx, next: () => Promise<void>) => Promise<Response | void>;
  getVisitor: (c: Ctx) => Promise<string>;
}

export function mountMessages({ app, requireAdmin, getVisitor }: Deps) {
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    message: "留言有点频繁，请稍后再试。",
  });

  app.post("/api/messages", limit, async (c: Ctx) => {
    const body = await c.req.json().catch(() => null);
    const input = messageSchema.safeParse(body);
    if (!input.success) {
      throw new HttpError(400, input.error.issues[0]?.message || "请检查留言内容。");
    }
    const { submissionId, name, email, body: text } = input.data;
    const visitorId = await getVisitor(c);
    const db = c.env.DB;
    const previous = await db
      .prepare("SELECT visitor_id,name,email,body FROM contact_messages WHERE id=?")
      .bind(submissionId)
      .first<{ visitor_id: string; name: string; email: string; body: string }>();
    if (previous) {
      if (
        previous.visitor_id !== visitorId ||
        previous.name !== name ||
        previous.email !== email ||
        previous.body !== text
      ) {
        throw new HttpError(409, "这条留言已提交，请修改内容后重新发送。");
      }
      return c.json({ received: true });
    }
    await db
      .prepare(
        "INSERT INTO contact_messages(id,visitor_id,name,email,body,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(submissionId, visitorId, name, email, text, new Date().toISOString())
      .run();
    return c.json({ received: true }, 201);
  });

  app.get("/api/messages", requireAdmin, async (c: Ctx) => {
    const db = c.env.DB;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .safeParse(c.req.query("page") || 1);
    if (!page.success) throw new HttpError(400, "页码无效。");
    const pageSize = 20;
    const { results } = await db
      .prepare(
        "SELECT id,name,email,body,created_at,is_read FROM contact_messages ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      )
      .bind(pageSize, (page.data - 1) * pageSize)
      .all<{
        id: string;
        name: string;
        email: string;
        body: string;
        created_at: string;
        is_read: number;
      }>();
    const total = await db
      .prepare("SELECT COUNT(*) n FROM contact_messages")
      .bind()
      .first<{ n: number }>();
    const unread = await db
      .prepare("SELECT COUNT(*) n FROM contact_messages WHERE is_read=0")
      .bind()
      .first<{ n: number }>();
    return c.json({
      messages: results.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        body: row.body,
        createdAt: row.created_at,
        read: Boolean(row.is_read),
      })),
      total: Number(total?.n ?? 0),
      unread: Number(unread?.n ?? 0),
      page: page.data,
      pageSize,
    });
  });

  app.patch("/api/messages/:id", requireAdmin, async (c: Ctx) => {
    const db = c.env.DB;
    const body = await c.req.json().catch(() => null);
    const input = z.object({ read: z.boolean() }).safeParse(body);
    if (!input.success) throw new HttpError(400, "留言状态无效。");
    const result = await db
      .prepare("UPDATE contact_messages SET is_read=? WHERE id=?")
      .bind(Number(input.data.read), c.req.param("id"))
      .run();
    if (!result.meta.changes) throw new HttpError(404, "这条留言已不存在。");
    return c.json({ updated: true });
  });

  app.delete("/api/messages/:id", requireAdmin, async (c: Ctx) => {
    const db = c.env.DB;
    await db
      .prepare("DELETE FROM contact_messages WHERE id=?")
      .bind(c.req.param("id"))
      .run();
    return c.json({ deleted: true });
  });
}
