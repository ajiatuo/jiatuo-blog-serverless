// 播放统计（无服务器版新增）
// 前端播放器在开始播放时打点 POST /api/stats/play {trackId}。
// 管理员在后台"播放统计"查看排行榜。
//
// 挂载方式（由 parent 在 src/app.ts 统一挂载）：
//   import { mountStatsRoutes } from "./stats.js";
//   mountStatsRoutes(app, siteAuth, sessionUser);

import { z } from "zod";
import type { Context } from "hono";
import type { Env } from "./db.js";
import type { SiteAuth } from "./auth.js";
type SessionUser = { id: string; isAdmin: boolean };
import { rateLimit } from "./ratelimit.js";

type Ctx = Context<{ Bindings: Env }>;

/** 从内容 JSON 取曲目 id → 标题映射（取不到标题时返回空字符串，前端显示"未命名课时"）。 */
async function trackTitles(db: D1Database): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const row = await db
      .prepare("SELECT data FROM site_content WHERE id=1")
      .bind()
      .first<{ data: string }>();
    if (!row) return map;
    const tracks = (JSON.parse(String(row.data)) as { tracks?: unknown }).tracks;
    if (!Array.isArray(tracks)) return map;
    for (const t of tracks) {
      if (
        t &&
        typeof t === "object" &&
        typeof (t as { id?: unknown }).id === "string"
      ) {
        const id = (t as { id: string }).id;
        const title = (t as { title?: unknown }).title;
        map.set(id, typeof title === "string" && title.trim() ? title.trim() : "");
      }
    }
  } catch {
    // 内容损坏时降级为空映射
  }
  return map;
}

const playBody = z.object({ trackId: z.string().min(1).max(64) });

export function mountStatsRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  siteAuth: SiteAuth,
  getSessionUser: (c: Ctx) => Promise<SessionUser | null>,
) {
  const playLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    message: "播放打点过于频繁，请稍后再试。",
  });

  // 播放打点：公开接口（登录/未登录均可），只记录不鉴权
  app.post("/api/stats/play", playLimiter, async (c: Ctx) => {
    const body = await c.req.json().catch(() => null);
    const input = playBody.safeParse(body);
    if (!input.success) {
      return c.json({ error: "参数无效。" }, 400);
    }
    const db: D1Database = c.env.DB;
    const su = await getSessionUser(c).catch(() => null);
    await db
      .prepare(
        "INSERT INTO play_stats (trackId, userId, playedAt) VALUES (?, ?, ?)",
      )
      .bind(input.data.trackId, su?.id ?? null, Date.now())
      .run();
    return c.json({ ok: true });
  });

  // 播放排行榜：仅管理员
  app.get(
    "/api/admin/play-stats",
    siteAuth.requireAdmin,
    async (c: Ctx) => {
      const db: D1Database = c.env.DB;
      const rows = await db
        .prepare(
          "SELECT trackId, COUNT(*) AS count FROM play_stats GROUP BY trackId ORDER BY count DESC",
        )
        .bind()
        .all<{ trackId: string; count: number }>();
      const totalRow = await db
        .prepare("SELECT COUNT(*) AS total FROM play_stats")
        .bind()
        .first<{ total: number }>();
      const titles = await trackTitles(db);
      const ranking = (rows.results ?? []).map((r) => {
        const title = titles.get(r.trackId);
        let display: string;
        if (title === undefined) {
          // 播放记录对应的曲目已不存在（v10.5 清理测试音频后遗留的打点）
          display = `已删除的课时 · ${r.trackId.slice(0, 8)}`;
        } else if (!title || title === "未命名课时" || title === "未命名音乐") {
          // 标题缺失或是批量上传的占位标题，加短 ID 后缀以便区分；改名后自动恢复正常显示
          display = `${title || "未命名课时"} · ${r.trackId.slice(0, 8)}`;
        } else {
          display = title;
        }
        return {
          trackId: r.trackId,
          title: display,
          count: Number(r.count),
        };
      });
      return c.json({ ranking, total: Number(totalRow?.total ?? 0) });
    },
  );
}
