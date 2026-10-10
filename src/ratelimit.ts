// 轻量内存滑动窗口限流（Hono 中间件）
// 对应原项目 express-rate-limit。Workers 每个 isolate 独立计数，属近似限流，
// 对防暴力破解已足够（登录 20次/分、初始化 5次/分）。

import type { Context, Next } from "hono";

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

function clientKey(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function rateLimit(opts: {
  windowMs: number;
  limit: number;
  message: string;
}) {
  const { windowMs, limit, message } = opts;
  return async (c: Context, next: Next) => {
    const key = `${c.req.path}:${clientKey(c)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      buckets.set(key, bucket);
    }
    // 淘汰窗口外的记录
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length >= limit) {
      const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
      return c.json({ message }, 429, { "Retry-After": String(retryAfter) });
    }
    bucket.hits.push(now);
    // 防止内存无限增长
    if (buckets.size > 5000) {
      const oldest = buckets.keys().next().value;
      if (oldest) buckets.delete(oldest);
    }
    await next();
  };
}
