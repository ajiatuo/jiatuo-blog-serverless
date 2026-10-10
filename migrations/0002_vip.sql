-- momo-blog 无服务器版 · 0002：付费账号登录听课
-- 1. 删除 0001 的 single_site_admin 唯一索引（它限制 user 表只能有一行），开放多用户注册
-- 2. user 表加 VIP 有效期字段（毫秒时间戳，NULL = 未开通）

DROP INDEX IF EXISTS single_site_admin;

ALTER TABLE "user" ADD COLUMN vipExpiresAt INTEGER;
