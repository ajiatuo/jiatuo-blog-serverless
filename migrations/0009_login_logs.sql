-- 管理员登录日志（登录提醒功能）
-- 每次管理员登录成功时由 better-auth 的 session.create.after hook 写入一条
-- 需手动执行：wrangler d1 execute momo-blog --file=migrations/0009_login_logs.sql --remote

CREATE TABLE IF NOT EXISTS login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS login_logs_user_created ON login_logs(user_id, created_at DESC);