// Cloudflare Worker 入口
// API 请求走 Hono，其余全部交给静态资源（Vite 构建的前端，SPA fallback 到 index.html）。

import { createApp } from "./app.js";
import { createSiteAuth, type SiteAuth } from "./auth.js";
import type { Env } from "./db.js";

// 同一 isolate 内缓存（env 绑定通常不变；变化时重建）
let cached: { env: Env; siteAuth: SiteAuth; app: ReturnType<typeof createApp> } | null = null;

function getApp(env: Env) {
  if (!cached || cached.env.DB !== env.DB || cached.env.AUTH_SECRET !== env.AUTH_SECRET) {
    const siteAuth = createSiteAuth(env.DB, env);
    cached = { env, siteAuth, app: createApp(siteAuth) };
  }
  return cached.app;
}

// Early Hints：Cloudflare 后台已开 Early Hints，但边缘只有在 Worker 响应
// 携带 `Link: rel=preload` 头时才会真正发出 103。
// 首页 HTML 很小（约 1KB），这里直接解析 Vite 注入的 /assets/*.js|css，
// 动态拼出 Link 头——文件名带 hash、每次构建都会变，所以运行时从 HTML 里取，不写死。
async function withEarlyHintsLinks(res: Response): Promise<Response> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) return res;
  const html = await res.text();
  const seen = new Set<string>();
  const links: string[] = [];
  const re = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const asset = m[1];
    if (seen.has(asset)) continue;
    seen.add(asset);
    links.push(`<${asset}>; rel=preload; as=${asset.endsWith(".css") ? "style" : "script"}`);
  }
  const headers = new Headers(res.headers);
  if (links.length > 0) headers.set("Link", links.join(", "));
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      const app = getApp(env);
      return app.fetch(request, env, ctx);
    }
    // 静态资源：wrangler [assets] 配置了 single-page-application，
    // 未知路径自动返回 index.html（覆盖 /, /login, /projects 等前端路由）
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      // 只给首页（/）加 Early Hints 的 Link 头，其余不动
      if (url.pathname === "/") {
        return withEarlyHintsLinks(res);
      }
      return res;
    }
    // 本地 wrangler dev 未提供 ASSETS 绑定时的兜底（生产环境不会走到这里）
    return new Response("Static assets binding unavailable in local dev.", {
      status: 404,
    });
  },
};
