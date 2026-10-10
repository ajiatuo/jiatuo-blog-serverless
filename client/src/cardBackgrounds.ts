import { mediaUrl, type CardId, type HomeContent } from "../../shared/model";

/**
 * 主页 9 张卡片背景图机制。
 *
 * - 生效顺序：后台「卡片背景」上传的图（site_content.cardBackgrounds 存 mediaId）
 *   > 下面的内置默认图 > 无背景。
 * - 内置默认图随构建发布于 client/public，管理员在后台点「恢复默认」即回到它；
 * - 没有内置默认图的卡，默认无背景（CardBg 渲染 null，不发任何请求），
 *   管理员在后台上传一张即生效。2/4/8 号卡本身已有照片/封面/缩略图，
 *   默认不配整卡背景。
 * - 不要在组件/CSS 里写死某张卡的图 URL：统一走 cardBgSrc()。
 *
 * 注意：缺省只保留 community（文件已在 public/，沿用原视觉）；其余 5 张新图
 * 由管理员在后台「卡片背景」上传（见交付 README），不写成构建内置路径，
 * 避免文件未就位时产生 404 请求。
 */
export const CARD_BG_FALLBACK: Partial<Record<CardId, string>> = {
  community: "/community-bg.webp",
};

/** 某张卡当前生效的背景图 URL；空字符串=无背景（不渲染背景层）。 */
export function cardBgSrc(
  content: HomeContent | null | undefined,
  id: CardId,
): string {
  const mid = content?.cardBackgrounds?.[id];
  if (mid) return mediaUrl(mid);
  return CARD_BG_FALLBACK[id] ?? "";
}

/** 后台「卡片背景」编辑器用的卡片名称（含用户定的 1–9 编号）。 */
export const CARD_BG_LABELS: Record<CardId, string> = {
  hero: "1 号卡 · Hero「唤醒心中的光」",
  photo: "2 号卡 · 日常切片（已有照片，不建议加背景）",
  clock: "3 号卡 · LOCAL TIME 时钟",
  meditation: "4 号卡 · 正念冥想（已有课程封面）",
  articles: "5 号卡 · 线下共修",
  project: "6 号卡 · 资源分享站",
  checkin: "7 号卡 · 玛雅调频",
  collections: "8 号卡 · 最近收集（已有缩略图）",
  community: "9 号卡 · 会员社区",
};
