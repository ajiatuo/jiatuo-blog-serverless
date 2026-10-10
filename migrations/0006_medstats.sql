-- 冥想数据统计：按用户+日期（Asia/Shanghai，YYYY-MM-DD）累计冥想秒数
CREATE TABLE IF NOT EXISTS meditation_stats (
  userId TEXT NOT NULL,
  day TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (userId, day)
);
