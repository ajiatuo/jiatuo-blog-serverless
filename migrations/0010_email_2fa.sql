-- 管理员邮箱两步验证
-- email_codes：存放验证码 SHA-256 哈希（不明文），5 分钟有效，一次有效
-- session.twoFactorVerifiedAt：该 session 最近一次通过邮箱验证码的时间（毫秒时间戳）
-- 需手动执行：wrangler d1 execute momo-blog --file=migrations/0010_email_2fa.sql --remote

CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_codes_user_created ON email_codes(user_id, created_at DESC);

ALTER TABLE session ADD COLUMN twoFactorVerifiedAt INTEGER;
