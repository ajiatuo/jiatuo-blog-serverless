-- 管理员登录日志加城市字段（异地登录提醒优化：显示城市、同城不报警）
-- 需手动执行：wrangler d1 execute momo-blog --file=migrations/0011_login_city.sql --remote
-- 注意：0009 已执行过，不要重跑 0009，只跑这一个

ALTER TABLE login_logs ADD COLUMN city TEXT NOT NULL DEFAULT '';
