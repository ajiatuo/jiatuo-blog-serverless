// Better Auth（无服务器版）
// 对应原项目 server/auth.ts：node:sqlite → Kysely + D1Dialect，Express → Hono 风格中间件
// 保留全部安全规则：单管理员、关闭公开注册、密码 12~128 位、登录限流、初始化令牌。

import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { z } from "zod";
import type { Context, Next } from "hono";

type Ctx = Context<{ Bindings: Env }>;
import { getCookie } from "hono/cookie";
import type { Env } from "./db.js";
import { rateLimit } from "./ratelimit.js";
import { getSetupToken } from "./db.js";
import { isAdmin2faVerified } from "./email2fa.js";

const AUTH_ENDPOINTS = ["sign-in/email", "sign-up/email", "get-session", "sign-out"] as const;

export interface SiteAuth {
  /**
   * 读 better-auth session。注意：better-auth 在 session 续期时会下发新的 Set-Cookie，
   * 这里会把它透传到当前响应的 header 上（浏览器 cookie 的 max-age 才会跟着续期），
   * 否则活跃用户的浏览器 cookie 仍按登录时的 max-age 到期，7 天后必掉线。
   */
  getSession: (
    c: Context,
  ) => Promise<{ user: { id: string; email: string }; session: { token: string } } | null>;
  handleAuth: (req: Request) => Promise<Response>;
  createAdmin: (email: string, password: string, name: string) => Promise<void>;
  requireAdmin: (c: Context, next: Next) => Promise<Response | void>;
  initialized: (db: D1Database) => Promise<boolean>;
}

/** 常量时间字符串比较（替代 node:crypto.timingSafeEqual）。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function appUrl(env: Env): string {
  return env.APP_URL || "https://example.com";
}

export function createSiteAuth(db: D1Database, env: Env): SiteAuth {
  // better-auth 1.7 的 Kysely 适配器要求 { dialect, type } 配置对象（不认裸 Kysely 实例）
  const dbConfig = {
    dialect: new D1Dialect({ database: db }),
    type: "sqlite" as const,
  };
  const baseURL = appUrl(env);
  // 生产环境必须通过 wrangler secret 设置 AUTH_SECRET；本地开发用固定值方便测试
  const secret = env.AUTH_SECRET || "dev-only-secret-change-in-production-1234567890";

  const config = {
    database: dbConfig,
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    telemetry: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: baseURL.startsWith("https://"),
      cookiePrefix: "hejia-homepage",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" as const },
      // D1 不支持 Kysely introspection 的 PRAGMA，跳过启动时 schema 自检
      // （表结构由 wrangler d1 migrations 统一管理）
      database: { validateSchema: false },
      // Cloudflare 下优先用 cf-connecting-ip 取真实客户端 IP（登录提醒用）
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    // 新用户注册：自动赠送 7 天体验会员（第一个用户是管理员初始化，跳过）
    // 注意：列 vip_source 由 0014 迁移添加；若迁移尚未应用，降级只写有效期
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id?: string } | null | undefined) => {
            try {
              const id = user?.id;
              if (!id) return;
              const cnt = await db
                .prepare('SELECT COUNT(*) AS n FROM "user"')
                .bind()
                .first<{ n: number }>();
              if (Number(cnt?.n) <= 1) return;
              const trialUntil = Date.now() + 7 * 86_400_000;
              await db
                .prepare(
                  'UPDATE "user" SET vipExpiresAt=? WHERE id=? AND vipExpiresAt IS NULL',
                )
                .bind(trialUntil, id)
                .run();
              try {
                await db
                  .prepare('UPDATE "user" SET vip_source=? WHERE id=?')
                  .bind("trial", id)
                  .run();
              } catch {
                // 0014 未应用时忽略，不影响体验会员本身
              }
            } catch {
              // 体验会员发放失败不影响注册流程
            }
          },
        },
      },
      session: {
        create: {
          after: async (session: {
            userId: string;
            ipAddress?: string | null;
            userAgent?: string | null;
          }) => {
            try {
              const admin = await db
                .prepare('SELECT id FROM "user" ORDER BY rowid LIMIT 1')
                .bind()
                .first<{ id: string }>();
              if (!admin || session.userId !== admin.id) return;
              await db
                .prepare(
                  "INSERT INTO login_logs(id, user_id, ip, user_agent) VALUES(?,?,?,?)",
                )
                .bind(
                  crypto.randomUUID(),
                  session.userId,
                  session.ipAddress ?? "",
                  session.userAgent ?? "",
                )
                .run();
              // 只保留最近 100 条，防止表无限增长
              await db
                .prepare(
                  "DELETE FROM login_logs WHERE user_id=? AND id NOT IN " +
                    "(SELECT id FROM login_logs WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100)",
                )
                .bind(session.userId, session.userId)
                .run();
            } catch {
              // 日志写入失败不影响登录
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // 公开注册已开放（新用户默认无 VIP，听课权限由管理员在后台开通）
      // 注册入口由 AUTH_ENDPOINTS + 独立严格限流保护
      disableSignUp: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    user: {
      additionalFields: {
        // VIP 有效期（毫秒时间戳，null = 未开通）
        // input: false → 用户注册/更新时无法自行设置，只能由管理员直接写库
        vipExpiresAt: {
          type: "number",
          required: false,
          input: false,
        },
        // 会员来源：trial=注册赠送 7 天体验，paid=微信支付，manual=手动确认开通
        // input: false → 只能由后端逻辑写入
        vip_source: {
          type: "string",
          required: false,
          input: false,
        },
        // 会员个人主题（null = 跟随全站默认）
        // input: false → 只能走 /api/user/theme 接口设置（需 VIP 会员身份）
        theme: {
          type: "string",
          required: false,
          input: false,
        },
      } as const,
    },
  };
  const auth = betterAuth(config);
  // 初始化专用实例：仅允许首次创建管理员
  const bootstrap = betterAuth({
    ...config,
    emailAndPassword: { ...config.emailAndPassword, disableSignUp: false },
  });

  const initialized = async (database: D1Database): Promise<boolean> => {
    const row = await database
      .prepare('SELECT id FROM "user" LIMIT 1')
      .bind()
      .first();
    return !!row;
  };

  const getSession: SiteAuth["getSession"] = async (c) => {
    type SessionData = {
      user: { id: string; email: string };
      session: { token: string };
    } | null;
    // returnHeaders: true 让 better-auth 把 Set-Cookie（含 session 续期）一起返回，
    // 而不是静默丢掉；续期 cookie 必须送达浏览器，7 天滑动登录才真正生效。
    const res = (await (auth.api.getSession as (...args: unknown[]) => Promise<unknown>)({
      headers: c.req.raw.headers,
      returnHeaders: true,
    })) as { headers?: Headers; response?: SessionData } | SessionData | null;
    if (res && typeof res === "object" && "response" in res) {
      const hdrs = (res as { headers?: Headers }).headers;
      const getSetCookie = (
        hdrs as unknown as { getSetCookie?: () => string[] } | undefined
      )?.getSetCookie;
      if (typeof getSetCookie === "function") {
        for (const sc of getSetCookie.call(hdrs)) {
          c.header("Set-Cookie", sc, { append: true });
        }
      }
      return (res as { response?: SessionData }).response ?? null;
    }
    return (res as SessionData) ?? null;
  };

  const requireAdmin = async (c: Context, next: Next) => {
    const data = await getSession(c);
    // 管理员 = user 表第一条记录（rowid 最小）；ORDER BY 保证多用户下稳定
    const admin = await db.prepare('SELECT id FROM "user" ORDER BY rowid LIMIT 1').bind().first<{ id: string }>();
    if (!data || !admin || data.user.id !== admin.id) {
      return c.json({ error: "登录已过期，请重新登录。" }, 401);
    }
    // 邮箱两步验证：session 必须在 12 小时内通过验证码
    // token 取自 better-auth session 数据，不手工读 Cookie（Cookie 名含 __Secure- 前缀，易对不上）
    if (!(await isAdmin2faVerified(db, data.session.token))) {
      return c.json({ error: "需要邮箱验证码二次验证。", code: "2fa_required" }, 401);
    }
    c.set("admin", data.user);
    await next();
  };

  const handleAuth = async (req: Request): Promise<Response> => {
    return auth.handler(req);
  };

  const createAdmin = async (email: string, password: string, name: string) => {
    await bootstrap.api.signUpEmail({ body: { email, password, name } });
  };

  return { getSession, handleAuth, createAdmin, requireAdmin, initialized };
}

/** Cloudflare 英文城市名 → 中文（异地登录提醒用）。未收录的直接显示英文。 */
const CITY_ZH: Record<string, string> = {
  Beijing: "北京市", Shanghai: "上海市", Tianjin: "天津市", Chongqing: "重庆市",
  Guangzhou: "广州市", Shenzhen: "深圳市", Dongguan: "东莞市", Foshan: "佛山市",
  Chengdu: "成都市", Wuhan: "武汉市", Hangzhou: "杭州市", Nanjing: "南京市",
  Suzhou: "苏州市", "Xi'an": "西安市", Xian: "西安市", Zhengzhou: "郑州市",
  Changsha: "长沙市", Hefei: "合肥市", Fuzhou: "福州市", Xiamen: "厦门市",
  Nanchang: "南昌市", Nanning: "南宁市", Haikou: "海口市", Sanya: "三亚市",
  Guiyang: "贵阳市", Kunming: "昆明市", Dali: "大理市", Lijiang: "丽江市",
  Xishuangbanna: "西双版纳", Yuxi: "玉溪市", Qujing: "曲靖市", Baoshan: "保山市",
  Zhaotong: "昭通市", Lincang: "临沧市", "Pu'er": "普洱市", "Puer": "普洱市",
  Lanzhou: "兰州市", Xining: "西宁市", Yinchuan: "银川市", Hohhot: "呼和浩特市",
  Urumqi: "乌鲁木齐市", Lhasa: "拉萨市", Harbin: "哈尔滨市", Changchun: "长春市",
  Shenyang: "沈阳市", Dalian: "大连市", Jinan: "济南市", Qingdao: "青岛市",
  Taiyuan: "太原市", Shijiazhuang: "石家庄市", Tangshan: "唐山市",
  Wuxi: "无锡市", Changzhou: "常州市", Nantong: "南通市", Ningbo: "宁波市",
  Wenzhou: "温州市", Quanzhou: "泉州市", Nanyang: "南阳市", Luoyang: "洛阳市",
  Wuhu: "芜湖市", Ganzhou: "赣州市", Jiujiang: "九江市", Liuzhou: "柳州市",
  Guilin: "桂林市", Zunyi: "遵义市", Mianyang: "绵阳市", Nanchong: "南充市",
  Yibin: "宜宾市", Dazhou: "达州市", Xianyang: "咸阳市", Baoji: "宝鸡市",
  Tianshui: "天水市", Yantai: "烟台市", Weifang: "潍坊市", Linyi: "临沂市",
  Xuzhou: "徐州市", "Huai'an": "淮安市", Yancheng: "盐城市",
  Jiaxing: "嘉兴市", Shaoxing: "绍兴市", Jinhua: "金华市", Taizhou: "台州市",
  Zhongshan: "中山市", Zhuhai: "珠海市", Huizhou: "惠州市", Jiangmen: "江门市",
  Shantou: "汕头市", Haikou2: "海口市",
  "Hong Kong": "香港", Macao: "澳门", Macau: "澳门", Taipei: "台北市",
};

/** 从 Cloudflare 请求中提取城市中文名（Worker 原生地理位置，零依赖）。 */
function getRequestCity(c: Ctx): string {
  try {
    const raw = c.req.raw as unknown as { cf?: { city?: unknown } };
    const cityEn = typeof raw.cf?.city === "string" ? raw.cf.city : "";
    if (!cityEn) return "";
    return CITY_ZH[cityEn] || cityEn;
  } catch {
    return "";
  }
}

/** IP 归一化：去首尾空格、转小写、去掉 IPv4 映射前缀 ::ffff:。
 * Better Auth 记录的 IP 与 cf-connecting-ip 格式可能不一致（如 IPv6 大小写差异、IPv4 映射前缀），
 * 比对前归一化，让城市回填对 IPv6 也生效。 */
function normalizeIp(ip: string | null | undefined): string {
  if (!ip) return "";
  return ip.trim().toLowerCase().replace(/^::ffff:/, "");
}

/** 挂载认证相关路由到 Hono app（db/env 从请求上下文取）。 */
export function mountAuthRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  siteAuth: SiteAuth,
) {
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    message: "登录尝试过于频繁，请一分钟后再试。",
  });
  // 注册单独严格限流（防刷号）：每 IP 每分钟 5 次
  const signupLimiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    message: "注册过于频繁，请一分钟后再试。",
  });

  // 注册端点走独立严格限流（静态路由优先于下面的通配符）
  app.post("/api/auth/sign-up/email", signupLimiter, async (c: Ctx) => {
    return siteAuth.handleAuth(c.req.raw);
  });

  // 只开放 AUTH_ENDPOINTS 里的认证端点，其余一律 404
  app.all("/api/auth/*", authLimiter, async (c: Ctx) => {
    const endpoint = c.req.path.slice("/api/auth/".length);
    if (!(AUTH_ENDPOINTS as readonly string[]).includes(endpoint)) {
      return c.json({ error: "此认证入口未开放。" }, 404);
    }
    return siteAuth.handleAuth(c.req.raw);
  });

  app.get("/api/admin/status", async (c: Ctx) => {
    const data = await siteAuth.getSession(c);
    return c.json({
      initialized: await siteAuth.initialized(c.env.DB),
      authenticated: !!data,
      ...(data ? { email: data.user.email } : {}),
    });
  });

  // 管理员登录提醒：返回最近两次管理员登录记录（本次 + 上次），带城市
  // 城市回填：最新一条若城市为空且 IP 与当前请求一致，用 Cloudflare 地理位置补上
  // （database hook 写日志时拿不到 request.cf，回填是最可靠的零依赖方案）
  // 表尚未迁移时返回空数组，不报错
  app.get("/api/admin/last-login", siteAuth.requireAdmin, async (c: Ctx) => {
    try {
      const admin = await c.env.DB
        .prepare('SELECT id FROM "user" ORDER BY rowid LIMIT 1')
        .bind()
        .first<{ id: string }>();
      if (!admin) return c.json({ logins: [] });
      const res = await c.env.DB
        .prepare(
          "SELECT id, ip, city, user_agent, created_at FROM login_logs WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 2",
        )
        .bind(admin.id)
        .all<{
          id: string;
          ip: string;
          city: string;
          user_agent: string;
          created_at: string;
        }>();
      const logins = res.results ?? [];
      // 回填城市：所有城市为空且 IP 与当前请求一致的记录（database hook 写日志时拿不到 request.cf）
      // IP 归一化后比对：Better Auth 记录的 IP 格式与 cf-connecting-ip 可能不一致（如 IPv6 大小写、::ffff: 前缀）
      if (logins.length > 0) {
        const currentCity = getRequestCity(c);
        const currentIp = normalizeIp(
          c.req.header("cf-connecting-ip")?.split(",")[0],
        );
        if (currentCity && currentIp) {
          const needUpdate = logins.filter(
            (l) => !l.city && normalizeIp(l.ip) === currentIp,
          );
          if (needUpdate.length > 0) {
            try {
              for (const l of needUpdate) {
                await c.env.DB
                  .prepare("UPDATE login_logs SET city=? WHERE id=?")
                  .bind(currentCity, l.id)
                  .run();
                l.city = currentCity;
              }
            } catch {
              // 回填失败不影响返回
            }
          }
        }
      }
      return c.json({
        logins: logins.map(({ id: _id, ...rest }) => rest),
      });
    } catch {
      return c.json({ logins: [] });
    }
  });

  let initializing = false;
  app.post(
    "/api/setup",
    rateLimit({
      windowMs: 60_000,
      limit: 5,
      message: "初始化尝试过于频繁，请稍后重试。",
    }),
    async (c: Ctx) => {
      const env = c.env;
      const db = env.DB;
      if ((await siteAuth.initialized(db)) || initializing) {
        return c.json({ error: "管理员已创建，初始化入口已关闭。" }, 409);
      }
      const body = await c.req.json().catch(() => null);
      const input = z
        .object({
          token: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(12).max(128),
        })
        .safeParse(body);
      if (!input.success) {
        return c.json({ error: "请填写有效邮箱、初始化令牌和至少 12 位密码。" }, 400);
      }
      const expected = await getSetupToken(db, env);
      if (!expected || !safeEqual(input.data.token, expected)) {
        return c.json({ error: "初始化令牌不正确。" }, 403);
      }
      initializing = true;
      try {
        await siteAuth.createAdmin(input.data.email, input.data.password, "Site Admin");
        return c.json({ ok: true }, 201);
      } catch {
        return c.json({ error: "创建失败，请检查资料后重试。" }, 400);
      } finally {
        initializing = false;
      }
    },
  );

  void getCookie;
}
