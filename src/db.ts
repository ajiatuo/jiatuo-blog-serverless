// D1 数据库访问层（无服务器版）
// 对应原项目 server/db.ts（node:sqlite DatabaseSync → Cloudflare D1）

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  AUTH_SECRET?: string;
  SETUP_TOKEN?: string;
  VIP_PASSWORD?: string;
  APP_URL?: string;
  ENVIRONMENT?: string;
  /** 邮箱 2FA：验证码收件人（默认 admin@example.com）、发件人（默认 noreply@example.com） */
  ADMIN_2FA_TO?: string;
  ADMIN_2FA_FROM?: string;
  /** Resend 发信 API Key（wrangler secret put RESEND_API_KEY） */
  RESEND_API_KEY?: string;
  /** 微信支付 v3（全自动扫码支付）：全部 wrangler secret put 设置，不写代码、不进仓库
   *  WECHAT_MCHID        商户号
   *  WECHAT_API_KEY      APIv3 密钥（32 位）
   *  WECHAT_CERT_SERIAL  商户 API 证书序列号
   *  WECHAT_PRIVATE_KEY  商户 API 证书私钥 PEM 全文
   *  WECHAT_APPID        必填；商户绑定的 appid（Native 下单微信要求必填）
   */
  WECHAT_MCHID?: string;
  WECHAT_API_KEY?: string;
  WECHAT_CERT_SERIAL?: string;
  WECHAT_PRIVATE_KEY?: string;
  WECHAT_APPID?: string;
  /** 公众号 AppSecret（JSAPI OAuth 静默授权换 openid 用，wrangler secret put WECHAT_APPSECRET） */
  WECHAT_APPSECRET?: string;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key=?")
    .bind(key)
    .first<{ value: string }>();
  return row ? row.value : null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(key, value)
    .run();
}

/** 首次启动时确保业务表存在（D1 迁移是首选，这里做兜底）。 */
export async function ensureSchema(db: D1Database): Promise<void> {
  const row = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='site_content'",
    )
    .bind()
    .first();
  if (row) return;
  // 兜底：如果迁移没跑，建最小业务表（auth 表仍需走迁移）。
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS site_content (
        id INTEGER PRIMARY KEY CHECK(id=1),
        revision INTEGER NOT NULL DEFAULT 1,
        data TEXT NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        thumb TEXT,
        mime TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        duration REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS visitors (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        visitor_id TEXT NOT NULL REFERENCES visitors(id),
        day TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS visit_day_visitor ON visits(day, visitor_id)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS checkins (
        visitor_id TEXT NOT NULL REFERENCES visitors(id),
        day TEXT NOT NULL,
        PRIMARY KEY(visitor_id, day)
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS likes (
        visitor_id TEXT PRIMARY KEY REFERENCES visitors(id)
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS contact_messages (
        id TEXT PRIMARY KEY,
        visitor_id TEXT NOT NULL REFERENCES visitors(id),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS contact_messages_created ON contact_messages(created_at DESC, id DESC)`,
    ),
  ]);
}

/** 首次运行种子：写入默认首页内容与站点启动时间。 */
export async function ensureSeeded(db: D1Database): Promise<void> {
  const row = await db
    .prepare("SELECT id FROM site_content WHERE id=1")
    .bind()
    .first();
  if (row) return;
  const { defaultHomeContent } = await import("./seed.js");
  const content = defaultHomeContent();
  await db
    .prepare("INSERT INTO site_content(id, revision, data) VALUES (1, 1, ?)")
    .bind(JSON.stringify(content))
    .run();
  if (!(await getSetting(db, "startedAt"))) {
    await setSetting(db, "startedAt", new Date().toISOString());
  }
}

/** 获取或生成一次性初始化令牌（存 D1 settings，重启不丢失）。 */
export async function getSetupToken(db: D1Database, env: Env): Promise<string | null> {
  // 已有管理员 → 初始化通道永久关闭
  const admin = await db.prepare('SELECT id FROM "user" LIMIT 1').bind().first();
  if (admin) return null;
  if (env.SETUP_TOKEN) return env.SETUP_TOKEN;
  const saved = await getSetting(db, "setupToken");
  if (saved) return saved;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await setSetting(db, "setupToken", token);
  console.log(
    "================================================================\n" +
      "  momo-blog 首次初始化令牌（只显示这一次，请妥善保存）：\n" +
      `  ${token}\n` +
      "  用 wrangler tail 查看此日志，或在 Cloudflare 控制台日志中查找。\n" +
      "================================================================\n",
  );
  return token;
}
