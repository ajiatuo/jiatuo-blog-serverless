-- 优惠券（运营后台新增）
-- kind: "days"（兑换送会员天数）或 "percent"（下单折扣百分比，预留给微信支付接入后使用）
-- maxUses=0 表示不限次数；usedCount 为已兑换次数
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  maxUses INTEGER NOT NULL DEFAULT 0,
  usedCount INTEGER NOT NULL DEFAULT 0,
  expiresAt INTEGER,
  createdAt INTEGER NOT NULL
);

-- 兑换记录：同一用户同一优惠券只能兑换一次
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  userId TEXT NOT NULL,
  code TEXT NOT NULL,
  redeemedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, code)
);
