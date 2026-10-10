import { z } from "zod";
import { articleDateSchema } from "./articles.js";
const text = (max: number) => z.string().max(max);
const id = z.string().min(1, "请补全内容或先上传所需素材。").max(80);
const mediaId = id.nullable();
const webLink = text(2048).refine(
  (v) =>
    !v ||
    (/^https?:\/\//i.test(v) &&
      (() => {
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      })()),
  "请输入 http 或 https 链接",
);
export const projectSchema = z.object({
  id,
  title: text(100),
  summary: text(240),
  description: text(20000),
  coverId: mediaId,
  url: webLink,
});
export const articleSchema = z.object({
  id,
  title: text(160),
  summary: text(300),
  body: text(50000),
  date: articleDateSchema,
  coverId: mediaId,
  url: webLink,
});
// 线下共修公告：单条线下课程活动（5 号卡展示用，编辑器独立维护）
export const eventSchema = z.object({
  id,
  title: text(80),
  date: text(40),
  location: text(80),
  spots: text(40),
  desc: text(300),
});
// 资源分享站：网盘链接 + 提取码仅 VIP / 管理员可见（6 号卡展示用，编辑器独立维护）
export const resourceSchema = z.object({
  id,
  title: text(80),
  desc: text(300),
  url: text(500),
  extractCode: text(20),
});
export const photoSchema = z.object({
  id,
  mediaId: id,
  title: text(160),
  caption: text(2000),
  location: text(160),
  source: text(2000),
  demo: z.boolean(),
});
export const collectionSchema = z.object({
  id,
  title: text(160),
  description: text(2000),
  kind: z.enum(["图片", "网站", "灵感"]),
  imageId: mediaId,
  url: webLink,
  source: text(2000),
  demo: z.boolean(),
});
export const friendSchema = z.object({
  id,
  title: text(80).trim().min(1, "请填写友链的网站名称"),
  description: text(300),
  url: z.string().trim().min(1, "请填写友链的网站链接").pipe(webLink),
  avatarId: mediaId,
});
export const trackSchema = z.object({
  id,
  title: text(160),
  artist: text(160),
  audioId: id,
  coverId: mediaId,
  demo: z.boolean(),
  source: text(2000),
  // VIP 付费曲目：需密码解锁才能播放（无服务器版新增）
  vip: z.boolean().default(false),
  // 曲目分类：音乐 / 冥想课程（老数据默认 music，向后兼容）
  category: z.enum(["music", "meditation"]).default("music"),
  // 所属课程名（如"30天正念入门"），为空表示单节（老字段：系列功能改用 seriesId，此处保留做回退匹配）
  course: text(160).default(""),
  // 所属课程系列 id（"" 表示未指定，按 course 名回溯匹配系列，默认归入默认系列）
  seriesId: z.string().max(80).default(""),
  // 音频时长（秒）：上传时由 music-metadata 解析写入；0 表示未知（老数据）
  duration: z.number().min(0).default(0),
});
// 师资介绍：单例内容，独立编辑器维护
// - credentials 为资质/经历列表（数组顺序即展示顺序）
// - 头像走现有 R2 素材机制（mediaId），不做额外转码
// - 顺序变更/字段变更都经 PUT /api/home 整体保存
// 注意：contentSchema 与 readHome 需同步补默认值，保证老数据可读
export const teacherCredentialSchema = z.object({
  id,
  text: text(500),
});
export const teacherSchema = z.object({
  /** 老师姓名 */
  name: text(40).default(""),
  /** 老师头像（R2 素材 id） */
  avatarId: mediaId.default(null),
  /** 头衔 / 一句话简介 */
  title: text(160).default(""),
  /** 详细介绍（多段文字，回车换行分段） */
  bio: text(10000).default(""),
  /** 资质 / 经历列表 */
  credentials: z.array(teacherCredentialSchema).max(50).default([]),
});
export type Teacher = z.infer<typeof teacherSchema>;
export const DEFAULT_TEACHER: Teacher = {
  name: "博主",
  avatarId: null,
  title: "博客作者",
  bio: "这是一个示例博客，你可以在后台编辑器中修改这里的介绍文字。",
  credentials: [],
};
// 关于学苑页（/about）：单例内容，独立编辑器维护
// - services 为服务卡片列表（数组顺序即展示顺序），icon 取自固定的 5 个 lucide 图标
// - contact 为联系方式，空值不展示
// - 字段变更经 PUT /api/home 整体保存
// 注意：contentSchema 与 readHome 需同步补默认值，保证老数据可读
export const aboutServiceIconSchema = z.enum([
  "heart",
  "leaf",
  "flower",
  "users",
  "moon",
]);
export type AboutServiceIcon = z.infer<typeof aboutServiceIconSchema>;
export const aboutServiceSchema = z.object({
  id,
  title: text(60),
  desc: text(300),
  icon: aboutServiceIconSchema.default("heart"),
});
export const aboutContactSchema = z.object({
  wechatMp: text(100).default(""),
  wechat: text(100).default(""),
  xiaohongshu: text(100).default(""),
  bilibili: text(100).default(""),
});
export const aboutSchema = z.object({
  /** 学苑标题 */
  title: text(60).default("一所帮助生命回家的学苑"),
  /** 学苑介绍 */
  intro: text(2000).default(
    "这是一个示例博客，你可以在后台编辑器中修改这里的介绍文字。",
  ),
  /** 服务卡片（数组顺序即展示顺序） */
  services: z.array(aboutServiceSchema).max(10).default([]),
  /** 联系方式 */
  contact: aboutContactSchema.default(() => ({
    wechatMp: "",
    wechat: "",
    xiaohongshu: "",
    bilibili: "",
  })),
});
export type About = z.infer<typeof aboutSchema>;
export const DEFAULT_ABOUT: About = {
  title: "我的博客",
  intro:
    "这是一个示例博客，你可以在后台编辑器中修改这里的介绍文字。",
  services: [
    {
      id: "svc-consult",
      title: "生命修行咨询",
      desc: "一对一的生命咨询，陪你看清困境，找到内在的路。",
      icon: "heart",
    },
    {
      id: "svc-paida",
      title: "心意禅拍疗愈",
      desc: "以拍打与正念结合的身心疗愈，松开身体里的结。",
      icon: "leaf",
    },
    {
      id: "svc-meditation",
      title: "正念冥想课程",
      desc: "从入门到深入的系列冥想课，在家就能修习。",
      icon: "flower",
    },
    {
      id: "svc-women",
      title: "女性觉醒课程",
      desc: "专为女性设计的觉醒之旅，找回属于自己的力量。",
      icon: "users",
    },
    {
      id: "svc-silence",
      title: "止语静心课程",
      desc: "在止语与静心中沉淀，听见内心真正的声音。",
      icon: "moon",
    },
  ],
  contact: { wechatMp: "", wechat: "", xiaohongshu: "", bilibili: "" },
};
// 冥想课程主页（/courses 落地页）：单例内容，独立编辑器维护
// - title/tagline/intro/price/coverId 构成课程销售页
// - reviews 为学员评价列表（数组顺序即展示顺序）
// - 顺序变更/字段变更都经 PUT /api/home 整体保存
// 注意：contentSchema 与 readHome 需同步补默认值，保证老数据可读
// 课程系列：除默认系列（走单例 course）外的新增系列（/courses 切换展示用）
// - id 为 "default" 保留给默认系列（由 content.course 实时合成，不存入 series 数组）
// - title/tagline/intro/price/coverId 与单例 course 同构，落地页渲染逻辑复用
// - reviews 暂只保留在默认系列（单例 course），新增系列不设评价区
// 注意：contentSchema 与 readHome 需同步补默认值，保证老数据可读
export const courseSeriesSchema = z.object({
  id,
  /** 系列名称 */
  title: text(60).default("新的系列"),
  /** 一句话卖点 */
  tagline: text(160).default(""),
  /** 系列介绍（多段文字，回车换行分段） */
  intro: text(10000).default(""),
  /** 价格展示（如 ¥99 / 会员畅听） */
  price: text(40).default(""),
  /** 系列封面（R2 素材 id，为空时用该系列第一节课封面） */
  coverId: mediaId.default(null),
});
export const courseReviewSchema = z.object({
  id,
  /** 学员昵称 */
  name: text(40),
  /** 评价内容 */
  body: text(500),
});
export const courseSchema = z.object({
  /** 课程标题 */
  title: text(60).default("30 天正念冥想课"),
  /** 一句话卖点 */
  tagline: text(160).default("每天 10 分钟，回到呼吸，回到自己。"),
  /** 课程介绍（多段文字，回车换行分段） */
  intro: text(10000).default(
    "这是一门为零基础设计的正念冥想课。\n从呼吸开始，一节一节，带你安住当下、松开紧绷、睡个好觉。\n每天只需 10 分钟，在任何安静的角落就能练习。",
  ),
  /** 价格展示（如 ¥99 / 会员畅听） */
  price: text(40).default("¥99"),
  /** 课程封面（R2 素材 id，为空时用第一节课封面） */
  coverId: mediaId.default(null),
  /** 学员评价（数组顺序即展示顺序） */
  reviews: z.array(courseReviewSchema).max(20).default([]),
});
export type Course = z.infer<typeof courseSchema>;
export type CourseReview = z.infer<typeof courseReviewSchema>;
/** 课程系列（新增系列；默认系列由单例 course 合成，见 getCourseSeriesList） */
export type CourseSeries = z.infer<typeof courseSeriesSchema>;
export const DEFAULT_COURSE: Course = {
  title: "30 天正念冥想课",
  tagline: "每天 10 分钟，回到呼吸，回到自己。",
  intro:
    "这是一门为零基础设计的正念冥想课。\n从呼吸开始，一节一节，带你安住当下、松开紧绷、睡个好觉。\n每天只需 10 分钟，在任何安静的角落就能练习。",
  price: "¥99",
  coverId: null,
  reviews: [
    {
      id: "review-1",
      name: "安然",
      body: "跟着练了两周，入睡变快了，半夜醒来的次数也少了。每天 10 分钟，成了我最期待的时刻。",
    },
    {
      id: "review-2",
      name: "青禾",
      body: "老师的声音很安稳，引导不急不赶。焦虑的时候打开一节，心会慢慢静下来。",
    },
    {
      id: "review-3",
      name: "山有信",
      body: "从第一节跟到现在，最大的变化是：遇到事情，先深呼吸，而不是先着急。",
    },
  ],
};
// Homepage 9-card drag order (admin rearranges in edit mode)
// - Array order = display order: 0-2 row 1, 3-5 row 2, 6-8 row 3
// - Card size follows grid position; swapping positions swaps sizes
// - Changes saved via PUT /api/home
// Note: keep contentSchema and readHome defaults in sync for old data
export const CARD_IDS = [
  "hero",
  "photo",
  "clock",
  "meditation",
  "articles",
  "project",
  "checkin",
  "collections",
  "community",
] as const;
export type CardId = (typeof CARD_IDS)[number];
export const DEFAULT_CARD_ORDER: string[] = [...CARD_IDS];
// 9 张主页卡片背景图（mediaId，可空；null=用内置默认图或无背景）
// 后台「卡片背景」可替换；注意：contentSchema 与 readHome 需同步补默认值
const cardBackgroundsSchema = z.object({
  hero: mediaId,
  photo: mediaId,
  clock: mediaId,
  meditation: mediaId,
  articles: mediaId,
  project: mediaId,
  checkin: mediaId,
  collections: mediaId,
  community: mediaId,
});
export type CardBackgrounds = z.infer<typeof cardBackgroundsSchema>;
export const DEFAULT_CARD_BACKGROUNDS: CardBackgrounds = {
  hero: null,
  photo: null,
  clock: null,
  meditation: null,
  articles: null,
  project: null,
  checkin: null,
  collections: null,
  community: null,
};
export function sanitizeCardOrder(order: unknown): string[] {
  const known = new Set<string>(CARD_IDS);
  const arr = Array.isArray(order)
    ? (order as unknown[]).filter((v): v is string => typeof v === "string" && known.has(v))
    : [];
  const seen = new Set(arr);
  for (const id of CARD_IDS) if (!seen.has(id)) arr.push(id);
  return arr.slice(0, CARD_IDS.length);
}
export const timeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "请选择有效时区");
export const weatherLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timeZone: timeZoneSchema,
});
export const locationSchema = weatherLocationSchema.extend({
  name: z.string().trim().min(1, "请填写地点名称").max(80),
  region: z.string().trim().max(40),
});
export type SiteLocation = z.infer<typeof locationSchema>;
export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
export interface LocationResult extends SiteLocation {
  country: string;
  area: string;
}
export const DEFAULT_LOCATION: SiteLocation = {
  name: "Sydney",
  region: "AU",
  timeZone: "Australia/Sydney",
  latitude: -33.8688,
  longitude: 151.2093,
};
export const weatherLocationKey = (location: WeatherLocation) =>
  `${location.latitude},${location.longitude},${location.timeZone}`;
export const DEFAULT_ABOUT_BODY =
  "这是我的个人空间。把作品、文字和日常放在一起，也为下一次突如其来的灵感，留一个位置。";
// 页脚「开源致谢」默认文案（后台 profile 可编辑）；原仓库链接固定展示
export const DEFAULT_CREDIT_TEXT =
  "本站基于 momo-blog 开源项目（MIT License）改造";
export const MOMO_BLOG_REPO_URL = "https://github.com/snowhejia/momo-blog";
export const siteThemeSchema = z.enum(["fresh", "blush", "midnight", "mist", "cream", "neon", "adventure", "ocean", "autumn", "zenstone", "moonphase", "yoga-dawn", "breath", "chant", "lotus", "earth", "lemon", "lavender", "mocha", "pine", "obsidian", "aurora", "wine"]);
export type SiteTheme = z.infer<typeof siteThemeSchema>;
export const contentSchema = z
  .object({
    theme: siteThemeSchema.default("fresh"),
    location: locationSchema.default(() => ({ ...DEFAULT_LOCATION })),
    profile: z.object({
      name: text(40),
      avatarId: mediaId.default(null),
      headline: text(160),
      introduction: text(300),
      description: text(300),
      aboutBody: text(5000).default(DEFAULT_ABOUT_BODY),
      eyebrow: text(100),
      motto: text(150),
      // 页脚开源致谢文案（后台可编辑）
      credit: text(300).default(DEFAULT_CREDIT_TEXT),
    }),
    social: z.object({
      github: webLink,
      xiaohongshu: webLink.default(""),
      bilibili: webLink.default(""),
      youtube: webLink.default(""),
      email: text(254).refine(
        (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        "请输入有效邮箱",
      ),
    }),
    teacher: teacherSchema.default(() => ({
      ...DEFAULT_TEACHER,
      credentials: DEFAULT_TEACHER.credentials.map((c) => ({ ...c })),
    })),
    about: aboutSchema.default(() => ({
      ...DEFAULT_ABOUT,
      services: DEFAULT_ABOUT.services.map((s) => ({ ...s })),
      contact: { ...DEFAULT_ABOUT.contact },
    })),
    course: courseSchema.default(() => ({
      ...DEFAULT_COURSE,
      reviews: DEFAULT_COURSE.reviews.map((r) => ({ ...r })),
    })),
    // 课程系列（默认系列走单例 course，此处只存新增系列；/courses 切换展示用）
    series: z.array(courseSeriesSchema).max(20).default([]),
    projects: z.array(projectSchema).max(100),
    articles: z.array(articleSchema).max(100),
    // 5 号卡“线下共修”公告（旧 articles 保留仅为兼容老数据，卡片与编辑器不再用）
    events: z.array(eventSchema).max(50).default([]),
    // 6 号卡“资源分享站”（旧 projects 保留仅为兼容老数据，卡片与编辑器不再用）
    resources: z.array(resourceSchema).max(100).default([]),
    photos: z.array(photoSchema).max(200),
    collections: z.array(collectionSchema).max(200),
    friends: z.array(friendSchema).max(100).default([]),
    tracks: z.array(trackSchema).max(100),
    cardOrder: z.array(z.string()).default(() => [...DEFAULT_CARD_ORDER]),
    // 9 张主页卡片背景图（后台「卡片背景」可替换；null=内置默认图或无背景）
    cardBackgrounds: cardBackgroundsSchema.default(() => ({
      ...DEFAULT_CARD_BACKGROUNDS,
    })),
  })
  .superRefine((c, ctx) => {
    for (const key of [
      "projects",
      "articles",
      "events",
      "resources",
      "photos",
      "collections",
      "friends",
      "tracks",
      "series",
    ] as const) {
      const ids = c[key].map((v) => v.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "内容标识不能重复",
        });
    }
  });
export type HomeContent = z.infer<typeof contentSchema>;
export const messageSchema = z.object({
  submissionId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, "请留下你的称呼。")
    .max(60, "称呼请控制在 60 字以内。"),
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "请输入有效邮箱，或留空。",
    ),
  body: z
    .string()
    .trim()
    .min(1, "先写下一点想说的话吧。")
    .max(2000, "留言请控制在 2000 字以内。"),
  website: z.string().max(0, "暂时无法提交，请重试。").default(""),
});
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  body: string;
  createdAt: string;
  read: boolean;
}
export interface MessageInbox {
  messages: ContactMessage[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}
export type Project = z.infer<typeof projectSchema>;
export type Article = z.infer<typeof articleSchema>;
/** 线下共修单条公告（5 号卡）。Event 会与 DOM 全局类型冲突，故用此前缀。 */
export type SiteEvent = z.infer<typeof eventSchema>;
/** 资源分享站单条资源（6 号卡） */
export type SiteResource = z.infer<typeof resourceSchema>;
export type Photo = z.infer<typeof photoSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Friend = z.infer<typeof friendSchema>;
export type Track = z.infer<typeof trackSchema>;
export interface HomeResponse {
  revision: number;
  content: HomeContent;
}
export interface Stats {
  todayVisitors: number;
  totalViews: number;
  daysOnline: number;
  checkedIn: boolean;
  checkins: number;
  likeCount: number;
  liked: boolean;
}
export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  email?: string;
  isAdmin?: boolean;
  /** 管理员已登录但未通过邮箱二次验证（此时 isAdmin 为 false） */
  needs2fa?: boolean;
  /** 会员个人主题（null = 跟随全站默认） */
  theme?: string | null;
}
export interface VisitorState {
  auth: AuthStatus;
  stats: Stats;
}
export interface Media {
  id: string;
  kind: "image" | "audio";
  url: string;
  duration?: number;
}
export interface Weather {
  available: boolean;
  temperature?: number;
  code?: number;
  updatedAt?: string;
  stale?: boolean;
}
// 冥想试听：每个系列各前 N 节免费（按 tracks 数组顺序），超出部分需会员/解锁
// 另：显式标记 demo 的冥想课时恒为试听（批量上传可设置），不受位置限制
// 改这里即可全局生效（前端锁定、徽标、试听数展示，后端音频鉴权引用同一函数）
export const MEDITATION_TRIAL_COUNT = 3;
/** 系列归属判定所需的课时最小形状 */
export interface SeriesKeyTrack {
  seriesId?: string | null;
  course?: string | null;
}
/** 可按系列分组的课时最小形状（试听/归属判定用） */
export interface TrialTrack extends SeriesKeyTrack {
  id: string;
  category?: string;
  demo?: boolean;
}
export const mediaUrl = (id: string | null | undefined, thumb = false) =>
  id ? `/api/media/${encodeURIComponent(id)}${thumb ? "?size=thumb" : ""}` : "";
/** 紧凑数字：908 → "908"，12345 → "1.2万"（首页统计数字展示用） */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const v = Math.max(0, Math.floor(n));
  if (v < 10000) return String(v);
  return `${(v / 10000).toFixed(1).replace(/\.0$/, "")}万`;
}
export function referencedMedia(
  c: HomeContent,
): Map<string, "image" | "audio"> {
  const refs = new Map<string, "image" | "audio">();
  const add = (id: string | null, kind: "image" | "audio" = "image") => {
    if (id) {
      if (refs.has(id) && refs.get(id) !== kind)
        throw new Error("同一素材不能同时用于图片和音频");
      refs.set(id, kind);
    }
  };
  add(c.profile.avatarId);
  add(c.teacher.avatarId);
  add(c.course.coverId);
  c.series.forEach((s) => add(s.coverId));
  c.photos.forEach((p) => add(p.mediaId));
  c.projects.forEach((p) => add(p.coverId));
  c.articles.forEach((p) => add(p.coverId));
  c.collections.forEach((p) => add(p.imageId));
  c.friends.forEach((p) => add(p.avatarId));
  c.tracks.forEach((p) => {
    add(p.audioId, "audio");
    add(p.coverId);
  });
  return refs;
}
export function zonedDay(date: Date, timeZone = DEFAULT_LOCATION.timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
