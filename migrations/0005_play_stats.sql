CREATE TABLE IF NOT EXISTS play_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trackId TEXT NOT NULL,
  userId TEXT,
  playedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_play_stats_track ON play_stats(trackId);
