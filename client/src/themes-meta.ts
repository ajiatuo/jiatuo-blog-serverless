// 主题元数据：标题 / 副标题 / 详情 / 图标 + 主题分类。
// 新增主题时：在此登记 meta、在 shared/model.ts 的 siteThemeSchema 加 id、
// 在 client/src/theme.ts 加 themeColors、在 themes.css 加变量块。

import {
  Citrus,
  Coffee,
  Compass,
  Cookie,
  Flame,
  Flower,
  Flower2,
  Gamepad2,
  Gem,
  Heart,
  Leaf,
  LeafyGreen,
  Moon,
  MoonStar,
  Mountain,
  Rainbow,
  Sparkles,
  Sprout,
  Sun,
  Sunrise,
  TreePine,
  Waves,
  Wind,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SiteTheme } from "../../shared/model";

export interface ThemeMeta {
  id: SiteTheme;
  title: string;
  subtitle: string;
  detail: string;
  icon: LucideIcon;
}

export const themeMeta: Record<SiteTheme, Omit<ThemeMeta, "id">> = {
  fresh: {
    title: "清新绿",
    subtitle: "一座慢慢生长的数字花园",
    detail: "自然留白 · 哑光纸感 · 轻盈日常",
    icon: Flower2,
  },
  blush: {
    title: "卡通粉",
    subtitle: "和猫咪一起，收藏可爱的日常",
    detail: "圆润文字 · 猫咪贴纸 · 彩色卡片",
    icon: Heart,
  },
  midnight: {
    title: "午夜紫",
    subtitle: "夜深了，也有温柔的光",
    detail: "深色磨砂 · 细线面板 · 星轨微光",
    icon: MoonStar,
  },
  mist: {
    title: "晨雾",
    subtitle: "雾散之后，都是温柔",
    detail: "暖雾白 · 杏色微光 · 松弛呼吸",
    icon: Sunrise,
  },
  cream: {
    title: "奶油",
    subtitle: "日子软软的，像刚出炉的面包",
    detail: "奶油白 · 焦糖 · 慵懒午后",
    icon: Coffee,
  },
  neon: {
    title: "霓虹",
    subtitle: "按下开始键，今晚不打烊",
    detail: "深空底 · 霓虹青 · 像素心跳",
    icon: Gamepad2,
  },
  adventure: {
    title: "秘境",
    subtitle: "地图的尽头，是新的开始",
    detail: "羊皮纸 · 森林绿 · 鎏金",
    icon: Compass,
  },
  ocean: {
    title: "海屿",
    subtitle: "把烦恼，寄给下一阵海风",
    detail: "雾蓝白 · 海水青 · 珊瑚点缀",
    icon: Waves,
  },
  autumn: {
    title: "秋野",
    subtitle: "落叶归根，丰盛安放",
    detail: "麦穗白 · 枫叶红 · 暖阳金",
    icon: Leaf,
  },
  zenstone: {
    title: "禅石",
    subtitle: "一花一世界，一叶一菩提",
    detail: "宣纸白 · 墨黑 · 朱砂点睛",
    icon: Mountain,
  },
  moonphase: {
    title: "月相",
    subtitle: "月亮不说话，只是照着你",
    detail: "夜空蓝 · 月光银 · 静谧安眠",
    icon: Moon,
  },
  "yoga-dawn": {
    title: "瑜伽·晨光",
    subtitle: "迎着日出，舒展身心",
    detail: "晨曦暖白 · 陶土 · 生机",
    icon: Sun,
  },
  breath: {
    title: "呼吸",
    subtitle: "一呼一吸，皆是当下",
    detail: "空气白 · 雾蓝 · 轻盈",
    icon: Wind,
  },
  chant: {
    title: "梵音",
    subtitle: "声声入心，静默有光",
    detail: "深暖夜 · 烛金 · 仪式感",
    icon: Flame,
  },
  lotus: {
    title: "荷花",
    subtitle: "出淤泥而不染",
    detail: "莲白 · 豆沙 · 清净",
    icon: Flower,
  },
  earth: {
    title: "大地",
    subtitle: "脚踩大地，心有安放",
    detail: "大地白 · 赭石 · 厚重",
    icon: Sprout,
  },
  lemon: {
    title: "柠檬黄",
    subtitle: "像气泡水一样清爽",
    detail: "柠檬黄 · 明亮 · 轻快",
    icon: Citrus,
  },
  lavender: {
    title: "薰衣草",
    subtitle: "浪漫但不甜腻",
    detail: "薰衣草紫 · 梦幻 · 优雅",
    icon: Sparkles,
  },
  mocha: {
    title: "摩卡",
    subtitle: "醇厚如一杯拿铁",
    detail: "摩卡棕 · 复古 · 温暖",
    icon: Cookie,
  },
  pine: {
    title: "松林",
    subtitle: "深林里的安静",
    detail: "深绿 · 沉稳 · 神秘",
    icon: TreePine,
  },
  obsidian: {
    title: "曜石",
    subtitle: "极简的酷",
    detail: "纯黑 · 克制 · 高级",
    icon: Gem,
  },
  aurora: {
    title: "极光",
    subtitle: "夜空下的流光",
    detail: "深空 · 极光 · 梦幻",
    icon: Rainbow,
  },
  wine: {
    title: "酒红",
    subtitle: "微醺的复古夜晚",
    detail: "酒红 · 优雅 · 醇香",
    icon: Wine,
  },
};

export interface ThemeCategory {
  id: string;
  title: string;
  subtitle: string;
  themes: SiteTheme[];
}

export const themeCategories: ThemeCategory[] = [
  {
    id: "color",
    title: "色调主题",
    subtitle: "经典配色，随心换装",
    themes: [
      "fresh",
      "blush",
      "midnight",
      "neon",
      "adventure",
      "ocean",
      "autumn",
      "lemon",
      "lavender",
      "mocha",
      "pine",
      "obsidian",
      "aurora",
      "wine",
    ],
  },
  {
    id: "healing",
    title: "疗愈主题",
    subtitle: "冥想 · 瑜伽 · 身心安放",
    themes: [
      "mist",
      "cream",
      "zenstone",
      "moonphase",
      "yoga-dawn",
      "breath",
      "chant",
      "lotus",
      "earth",
    ],
  },
];

/** 主题所属分类 id（默认 "color"）。 */
export function themeCategoryOf(id: SiteTheme): string {
  for (const c of themeCategories) {
    if (c.themes.includes(id)) return c.id;
  }
  return "color";
}
