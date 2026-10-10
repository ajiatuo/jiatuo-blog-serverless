-- momo-blog 无服务器版 · D1 初始化迁移
-- 由 better-auth 1.7.4 官方迁移工具生成的 auth 表结构（Kysely/SQLite 惯例）
-- 加上原项目 server/db.ts 的全部业务表

-- ============ Better Auth 表 ============

CREATE TABLE "user" (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE session (
  id TEXT NOT NULL PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE account (
  id TEXT NOT NULL PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE verification (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- 全站只允许一个管理员账号（与原项目保持一致）
CREATE UNIQUE INDEX single_site_admin ON "user" ((1));

-- ============ 业务表（原 server/db.ts） ============

CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  thumb TEXT,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS visit_day_visitor ON visits(day, visitor_id);

CREATE TABLE IF NOT EXISTS checkins (
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  day TEXT NOT NULL,
  PRIMARY KEY(visitor_id, day)
);

CREATE TABLE IF NOT EXISTS likes (
  visitor_id TEXT PRIMARY KEY REFERENCES visitors(id)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS contact_messages_created ON contact_messages(created_at DESC, id DESC);
