-- 会员社区（memos 风格）：动态、回复、表情回应 + 按人审核开关

CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memos_status_created ON memos(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_user ON memos(user_id);

CREATE TABLE IF NOT EXISTS memo_replies (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_replies_memo ON memo_replies(memo_id, created_at);

CREATE TABLE IF NOT EXISTS memo_reactions (
  memo_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (memo_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_memo ON memo_reactions(memo_id);

-- 按人审核开关：1 = 该会员发动态需审核，默认 0（直接显示）
ALTER TABLE "user" ADD COLUMN require_review INTEGER NOT NULL DEFAULT 0;
