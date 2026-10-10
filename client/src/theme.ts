import { useLayoutEffect } from "react";
import type { SiteTheme } from "../../shared/model";

const themeColors: Record<SiteTheme, string> = {
  fresh: "#f7f6f2",
  blush: "#fff6ee",
  midnight: "#12151f",
  mist: "#F7F3EE",
  cream: "#FFF9F0",
  neon: "#0D0F1A",
  adventure: "#F3EFE4",
  ocean: "#F2F7F9",
  autumn: "#FAF5EC",
  zenstone: "#F4F2ED",
  moonphase: "#141824",
  "yoga-dawn": "#FDF6EE",
  breath: "#F4F8FA",
  chant: "#1E1A16",
  lotus: "#FDF8F5",
  earth: "#F5F0E6",
  lemon: "#FFFBEA",
  lavender: "#F7F4FC",
  mocha: "#F7F3EE",
  pine: "#14211B",
  obsidian: "#101012",
  aurora: "#0E1A1E",
  wine: "#1F1418",
};

export function themeCatAsset(theme: SiteTheme = "fresh") {
  return theme === "blush"
    ? "/assets/themes/cartoon-cat.svg"
    : "/assets/cat.svg";
}

export const DARK_THEMES: SiteTheme[] = [
  "midnight",
  "neon",
  "moonphase",
  "chant",
  "pine",
  "obsidian",
  "aurora",
  "wine",
];

/**
 * 解析当前 color-scheme：暗夜鎏金版面风格强制深色，其余跟随色调主题。
 * 供 theme.ts 与 layout.ts 共用，避免两处内联设置打架。
 */
export function resolveColorScheme(): "dark" | "light" {
  if (
    typeof document !== "undefined" &&
    document.documentElement.dataset.layout === "darkgold"
  )
    return "dark";
  const theme = (
    typeof document !== "undefined"
      ? document.documentElement.dataset.theme
      : undefined
  ) as SiteTheme | undefined;
  return theme && DARK_THEMES.includes(theme) ? "dark" : "light";
}

export function useSiteTheme(theme: SiteTheme = "fresh") {
  useLayoutEffect(() => {
    const el = document.documentElement;
    // 主题切换加 0.6s 全站色彩过渡：先挂过渡类再换主题，650ms 后摘掉（兜底，避免 transitionend 丢失导致类残留）
    el.classList.add("theme-transitioning");
    el.dataset.theme = theme;
    el.style.colorScheme = resolveColorScheme();
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColors[theme]);
    const t = window.setTimeout(() => el.classList.remove("theme-transitioning"), 650);
    return () => {
      window.clearTimeout(t);
      el.classList.remove("theme-transitioning");
    };
  }, [theme]);
}
