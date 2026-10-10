// 管理员邮箱两步验证（2FA）
// 流程：密码登录成功（better-auth session 已建立）→ /api/admin/request-code 发 6 位验证码
// 到管理员邮箱 → /api/admin/verify-code 校验通过后，在 session 行写 twoFactorVerifiedAt
// → requireAdmin 要求该时间戳在 12 小时内，否则返回 2fa_required。
//
// 发件走 Resend（https://api.resend.com/emails），需要 API Key。
// RESEND_API_KEY 通过 `wrangler secret put RESEND_API_KEY` 设置，切勿写进代码。
// 收件人/发件人可用环境变量覆盖：ADMIN_2FA_TO / ADMIN_2FA_FROM（wrangler secret 或 [vars]）。
// 历史：2024-06 前曾用 MailChannels 免费发信，MailChannels 已于 2024-06-30 停止
// Cloudflare Workers 集成，故切换到 Resend。

import type { Context } from "hono";
import type { Env } from "./db.js";
import type { SiteAuth } from "./auth.js";
import { rateLimit } from "./ratelimit.js";

type Ctx = Context<{ Bindings: Env }>;

/** 2FA 验证有效期：12 小时 */
export const ADMIN_2FA_VALID_MS = 12 * 3600_000;
/** 验证码有效期：5 分钟 */
export const ADMIN_2FA_CODE_TTL_MS = 5 * 60_000;

function getClientIp(c: Ctx): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function genCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

/** 临时开关：测试期间关闭管理员 2FA（2026-10-10 用户要求）。
 *  测试通过后必须改回 false 并重新部署！ */
const TEMP_DISABLE_ADMIN_2FA = true;

/** 当前 session 是否通过了 2FA（12 小时内）。 */
export async function isAdmin2faVerified(
  db: D1Database,
  sessionToken: string | null,
): Promise<boolean> {
  // 临时：测试期间跳过 2FA（见上方开关）
  if (TEMP_DISABLE_ADMIN_2FA) return true;
  if (!sessionToken) return false;
  const row = await db
    .prepare("SELECT twoFactorVerifiedAt FROM session WHERE token=?")
    .bind(sessionToken)
    .first<{ twoFactorVerifiedAt: number | null }>();
  const at = Number(row?.twoFactorVerifiedAt || 0);
  return at > 0 && Date.now() - at < ADMIN_2FA_VALID_MS;
}

async function sendLoginCodeMail(
  env: Env,
  to: string,
  code: string,
): Promise<void> {
  const from = env.ADMIN_2FA_FROM || "noreply@example.com";
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Resend 发送失败: 未配置 RESEND_API_KEY");
    throw new Error("验证码发送失败，请检查发件域名配置后重试。");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `My Blog <${from}>`,
      to: [to],
      subject: "My Blog管理员登录验证码",
      text:
        `你的管理员登录验证码是：${code}\n` +
        `5 分钟内有效，请勿转发。如非本人操作，请立即修改管理员密码。`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Resend 发送失败:", res.status, text.slice(0, 200));
    throw new Error("验证码发送失败，请检查发件域名配置后重试。");
  }
}

/** 取当前登录的管理员身份（只验身份，不验 2FA）。附带 better-auth 的 session token，避免手工读 Cookie 名。 */
async function getAdminIdentity(
  c: Ctx,
  siteAuth: SiteAuth,
): Promise<{ id: string; email: string; sessionToken: string } | null> {
  const data = await siteAuth.getSession(c);
  if (!data) return null;
  const admin = await c.env.DB
    .prepare('SELECT id, email FROM "user" ORDER BY rowid LIMIT 1')
    .bind()
    .first<{ id: string; email: string }>();
  if (!admin || data.user.id !== admin.id) return null;
  return { id: admin.id, email: admin.email, sessionToken: data.session.token };
}

export function mountEmail2faRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  siteAuth: SiteAuth,
) {
  // 发码限流：同一 IP 每分钟最多 3 次
  const sendLimiter = rateLimit({
    windowMs: 60_000,
    limit: 3,
    message: "验证码发送过于频繁，请一分钟后再试。",
  });
  // 校验限流：同一 IP 每分钟最多 10 次
  const verifyLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    message: "验证尝试过于频繁，请一分钟后再试。",
  });

  app.post("/api/admin/request-code", sendLimiter, async (c: Ctx) => {
    const admin = await getAdminIdentity(c, siteAuth);
    if (!admin) return c.json({ error: "请先登录管理员账号。" }, 403);
    // 已在有效期内 → 直接放行，不重复发码
    if (await isAdmin2faVerified(c.env.DB, admin.sessionToken)) {
      return c.json({ ok: true, alreadyVerified: true });
    }
    const to = c.env.ADMIN_2FA_TO || "admin@example.com";
    const code = genCode();
    const id = crypto.randomUUID();
    const db = c.env.DB;
    // 先发信：发信成功后再作废旧码、写新码入库。
    // 若发信失败直接返回，不碰 DB，避免"库里有新码、用户却没收到邮件"导致旧码被作废、新码又对不上的死局。
    try {
      await sendLoginCodeMail(c.env, to, code);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    const now = Date.now();
    // 作废该用户之前未使用的验证码（一次只有一个有效码）
    await db
      .prepare("UPDATE email_codes SET used=1 WHERE user_id=? AND used=0")
      .bind(admin.id)
      .run();
    await db
      .prepare(
        "INSERT INTO email_codes(id,user_id,code_hash,expires_at,ip,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(id, admin.id, await sha256Hex(code), now + ADMIN_2FA_CODE_TTL_MS, getClientIp(c), now)
      .run();
    // 注意：绝不在响应/日志中返回验证码明文
    return c.json({ ok: true, expiresIn: ADMIN_2FA_CODE_TTL_MS / 1000 });
  });

  app.post("/api/admin/verify-code", verifyLimiter, async (c: Ctx) => {
    const admin = await getAdminIdentity(c, siteAuth);
    if (!admin) return c.json({ error: "请先登录管理员账号。" }, 403);
    const body = await c.req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return c.json({ error: "请输入 6 位数字验证码。" }, 400);
    }
    const db = c.env.DB;
    const row = await db
      .prepare(
        "SELECT id, code_hash, expires_at FROM email_codes WHERE user_id=? AND used=0 ORDER BY created_at DESC LIMIT 1",
      )
      .bind(admin.id)
      .first<{ id: string; code_hash: string; expires_at: number }>();
    const now = Date.now();
    if (
      !row ||
      Number(row.expires_at) < now ||
      !safeEqual(row.code_hash, await sha256Hex(code))
    ) {
      return c.json({ error: "验证码错误或已过期。" }, 400);
    }
    // 先确认 session 有效并写入 2FA 时间戳，再把验证码标为已用。
    // token 取自 better-auth session 数据（getAdminIdentity 已验证），不手工读 Cookie。
    // 若 session 已失效则不作废验证码，避免浪费用户手里的有效码。
    const updated = await db
      .prepare("UPDATE session SET twoFactorVerifiedAt=? WHERE token=?")
      .bind(now, admin.sessionToken)
      .run();
    if (!updated.meta.changes) {
      return c.json({ error: "登录已过期，请重新登录。" }, 401);
    }
    // 一次有效：session 更新成功后再标记已用
    await db.prepare("UPDATE email_codes SET used=1 WHERE id=?").bind(row.id).run();
    return c.json({ ok: true });
  });
}
