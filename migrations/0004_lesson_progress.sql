-- 课程学习进度：记录登录用户每节冥想课的完成情况，用于课程顺序解锁。
CREATE TABLE IF NOT EXISTS lesson_progress (
  userId TEXT NOT NULL,
  trackId TEXT NOT NULL,
  completedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, trackId)
);
