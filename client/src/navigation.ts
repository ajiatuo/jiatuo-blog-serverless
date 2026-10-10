import { useEffect, useState, type MouseEvent } from "react";

export const sectionNames = {
  projects: "项目",
  articles: "文字",
  photos: "相册",
  collections: "收集",
  friends: "友链",
} as const;
export type Section = keyof typeof sectionNames;
// 顶部导航的整页（仿 hejiac.com：整页切换、URL 变化、顶部菜单常驻）
export const sitePageNames = {
  community: "社区",
  about: "关于",
  teacher: "关于我",
} as const;
export type Page = "home" | Section | keyof typeof sitePageNames;
export const pageTitles: Record<Page, string> = {
  home: "首页",
  ...sectionNames,
  ...sitePageNames,
};

function readRoute(): { page: Page; id?: string } {
  let path = location.pathname;
  while (path.startsWith("/")) path = path.slice(1);
  while (path.endsWith("/") && path.length > 1) path = path.slice(0, -1);
  const page: Page = Object.hasOwn(sectionNames, path)
    ? (path as Section)
    : Object.hasOwn(sitePageNames, path)
      ? (path as keyof typeof sitePageNames)
      : "home";
  return {
    page,
    id: new URLSearchParams(location.search).get("item") || undefined,
  };
}

export function pageUrl(page: Page, id?: string) {
  const params = id ? `?${new URLSearchParams({ item: id })}` : "";
  return `${page === "home" ? "/" : "/" + page}${params}`;
}

// Keep the application and its single audio player mounted between sections.
export function usePageNavigation() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const navigate = (page: Page, id?: string) => {
    const url = pageUrl(page, id);
    if (`${location.pathname}${location.search}` !== url)
      history.pushState(null, "", url);
    setRoute({ page, id });
    if (
      !id ||
      route.page !== page ||
      page === "projects" ||
      page === "articles" ||
      page === "collections"
    ) {
      document.getElementById("main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    }
  };
  const follow = (event: MouseEvent<HTMLAnchorElement>, page: Page) => {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(page);
  };
  return { ...route, navigate, follow };
}
