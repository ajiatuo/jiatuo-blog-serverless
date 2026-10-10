import { lazy, Suspense, useState, useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, ArrowRight, GripVertical } from "lucide-react";
import { useSite } from "./store";
import { request } from "./api";
import { watchSiteDay } from "./daily-refresh";
import { useAppGestures } from "./gestures";
import { HomeSkeleton, CourseSkeleton } from "./components/Skeleton";
import { themeCatAsset, useSiteTheme } from "./theme";
import { mediaUrl, zonedDay, sanitizeCardOrder } from "../../shared/model";
import type { SiteTheme } from "../../shared/model";
import { Cat, Dialog, Editable, EditButton } from "./components/Common";
import {
  Hero,
  PhotoCard,
  ClockCard,
  ResourceCard,
  EventCard,
  CheckinCard,
  CollectionCard,
  CommunityCard,
  useClock,
  type Panel,
} from "./components/HomeCards";
import { SectionPlayer, MusicBottomBar } from "./components/Music";
import { CommunityPage, CommunityReviewDialog } from "./components/Community";
import { AdminBar, LoginDialog, UserAvatarMenu } from "./components/Auth";
import { WelcomePopup, TrialRenewNudge } from "./components/WelcomePopup";
import { SiteFooter } from "./components/SiteFooter";
// 关于/师资整页只在子路由访问时需要，拆成独立 chunk，首屏不加载
const AboutSection = lazy(() =>
  import("./components/About").then((module) => ({
    default: module.AboutSection,
  })),
);
const TeacherSection = lazy(() =>
  import("./components/About").then((module) => ({
    default: module.TeacherSection,
  })),
);
const BatchUploadDialog = lazy(() =>
  import("./components/BatchUpload").then((module) => ({
    default: module.BatchUploadDialog,
  })),
);
import type { EditorSection } from "./components/Editor";
import {
  usePageNavigation,
  pageUrl,
  sectionNames,
  pageTitles,
  type Page,
  type Section,
} from "./navigation";
const Editor = lazy(() =>
  import("./components/Editor").then((module) => ({ default: module.Editor })),
);
const ThemePicker = lazy(() =>
  import("./components/ThemePicker").then((module) => ({
    default: module.ThemePicker,
  })),
);
const ContentDialog = lazy(() =>
  import("./components/Drawers").then((module) => ({
    default: module.ContentDialog,
  })),
);
const ContentPage = lazy(() =>
  import("./components/Drawers").then((module) => ({
    default: module.ContentPage,
  })),
);
const InboxDialog = lazy(() =>
  import("./components/Contact").then((module) => ({
    default: module.InboxDialog,
  })),
);
const UsersDialog = lazy(() =>
  import("./components/Users").then((module) => ({
    default: module.UsersDialog,
  })),
);
function ModalFallback({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="正在打开…" onClose={onClose}>
      <p>稍等一下，内容马上就好。</p>
    </Dialog>
  );
}

// 主页 8 张卡片名称（用于拖拽提示）
const CARD_LABELS: Record<string, string> = {
  hero: "1号·Hero",
  photo: "2号·照片",
  clock: "3号·时钟",
  articles: "4号·线下共修",
  project: "5号·资源分享站",
  checkin: "6号·玛雅调频",
  collections: "7号·收集",
  community: "8号·社区",
};

// 单张卡片的排序包装：PC 端编辑模式用拖拽互换，移动端编辑模式用点选交换
//（点一张卡选中，再点另一张互换位置；点已选中的卡取消选中）
function DraggableCard({
  id,
  canDrag,
  canMove,
  dragId,
  dragOverId,
  setDragId,
  setDragOverId,
  onSwap,
  swapSelected,
  onCardTap,
  children,
}: {
  id: string;
  canDrag: boolean;
  canMove: boolean;
  dragId: string | null;
  dragOverId: string | null;
  setDragId: (v: string | null) => void;
  setDragOverId: (v: string | null) => void;
  onSwap: (fromId: string, toId: string) => void;
  swapSelected: string | null;
  onCardTap: (id: string) => void;
  children: ReactNode;
}) {
  if (!canDrag && !canMove) return <>{children}</>;
  const isDragging = canDrag && dragId === id;
  const isTarget = canDrag && dragOverId === id && dragId !== id;
  const isSwapSelected = canMove && swapSelected === id;
  const label = CARD_LABELS[id] || id;
  return (
    <div
      className={`home-card-drag${isDragging ? " is-dragging" : ""}${isTarget ? " is-drop-target" : ""}${isSwapSelected ? " is-swap-selected" : ""}`}
      draggable={canDrag || undefined}
      onClick={
        canMove
          ? (e) => {
              // 点选交换：忽略卡片内的可交互元素（编辑按钮、链接、输入框等），只响应点卡片空白处
              const t = e.target as HTMLElement;
              if (t.closest("button, a, input, textarea, select, [contenteditable]")) return;
              onCardTap(id);
            }
          : undefined
      }
      onDragStart={
        canDrag
          ? (e) => {
              e.dataTransfer.setData("text/plain", id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(id);
            }
          : undefined
      }
      onDragOver={
        canDrag
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverId !== id) setDragOverId(id);
            }
          : undefined
      }
      onDragLeave={
        canDrag
          ? () => {
              if (dragOverId === id) setDragOverId(null);
            }
          : undefined
      }
      onDrop={
        canDrag
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              const fromId = e.dataTransfer.getData("text/plain");
              if (fromId) onSwap(fromId, id);
              setDragId(null);
              setDragOverId(null);
            }
          : undefined
      }
      onDragEnd={
        canDrag
          ? () => {
              setDragId(null);
              setDragOverId(null);
            }
          : undefined
      }
    >
      {canDrag && (
        <span
          className="card-drag-handle"
          title={`拖动调整位置（${label}）`}
          aria-label={`拖动${label}调整位置`}
        >
          <GripVertical size={16} />
        </span>
      )}
      {children}
    </div>
  );
}

// 移动端卡片懒挂载：首屏只渲染 Hero，其余卡片进入视口附近 500px 时再挂载
//（IntersectionObserver 原生实现，零依赖；桌面端与编辑模式不启用）
function LazyMount({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // 带 #id 锚点直达时（如 /#meditation）直接渲染，保证锚点跳转可用
  const [mounted, setMounted] = useState(
    () =>
      typeof location !== "undefined" &&
      location.hash === `#${id}`,
  );
  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);
  if (mounted) return <>{children}</>;
  return <div ref={ref} className="lazy-mount-ph" aria-hidden="true" />;
}

// 主页 bento 网格（按 cardOrder 顺序渲染，支持管理员拖拽排序）
function HomeGrid({
  actions,
  now,
  setEditor,
  setLogin,
  setUploadCat,
  route,
  onSignup,
}: {
  actions: { open: (panel: Panel, id?: string) => void; edit: (section: EditorSection) => void };
  now: Date;
  setEditor: (s: EditorSection | null) => void;
  setLogin: (v: boolean) => void;
  setUploadCat: (v: "music" | null) => void;
  route: { navigate: (page: Page, id?: string) => void };
  /** 打开注册框（直接进注册 tab，供 9 号卡/欢迎弹窗用） */
  onSignup: () => void;
}) {
  const { content, editing, change } = useSite();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // 移动端点选交换：先选中的卡片 id
  const [swapSelected, setSwapSelected] = useState<string | null>(null);
  // 仅 PC 端启用拖拽（触屏误触多）
  const canDrag =
    editing &&
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1101px)").matches &&
    window.matchMedia("(pointer: fine)").matches;
  // 移动端编辑模式：用点选交换调顺序（触屏拖拽误触多，↑↓ 按钮会挡各卡编辑按钮）
  const canMoveMobile =
    editing &&
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1100px)").matches;
  // 退出编辑模式时清除点选交换的选中态
  useEffect(() => {
    if (!editing) setSwapSelected(null);
  }, [editing]);
  // 点选交换：点一张卡选中，再点另一张互换位置；点已选中的卡取消选中
  const handleCardTap = (id: string) => {
    if (!canMoveMobile) return;
    if (swapSelected === null) {
      setSwapSelected(id);
    } else if (swapSelected === id) {
      setSwapSelected(null);
    } else {
      swapCards(swapSelected, id);
      setSwapSelected(null);
    }
  };
  const order = sanitizeCardOrder(content?.cardOrder);
  // 移动端非编辑模式：除 Hero 外卡片懒挂载，首屏优先渲染 Hero；
  // 编辑模式全量渲染（管理员需看到全部卡片做排序），桌面端一屏布局不受影响
  const lazyCards =
    !editing &&
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1100px)").matches;
  const swapCards = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    change((c) => {
      const arr = sanitizeCardOrder(c.cardOrder);
      const from = arr.indexOf(fromId);
      const to = arr.indexOf(toId);
      if (from < 0 || to < 0) return c;
      const next = [...arr];
      [next[from], next[to]] = [next[to], next[from]];
      return { ...c, cardOrder: next };
    });
  };
  const renderCard = (id: string) => {
    switch (id) {
      case "hero":
        return <Hero {...actions} />;
      case "photo":
        return <PhotoCard {...actions} />;
      case "clock":
        return <ClockCard now={now} edit={setEditor} />;
      case "articles":
        return <EventCard {...actions} />;
      case "project":
        return <ResourceCard {...actions} />;
      case "checkin":
        return <CheckinCard />;
      case "collections":
        return <CollectionCard {...actions} />;
      case "community":
        return (
          <CommunityCard
            onOpen={() => route.navigate("community")}
            onLogin={onSignup}
          />
        );
      default:
        return null;
    }
  };
  const rows = [
    { className: "bento-row top-row", ids: order.slice(0, 3) },
    { className: "bento-row middle-row", ids: order.slice(3, 6) },
    { className: "bento-row bottom-row", ids: order.slice(6, 9) },
  ];
  return (
    <>
      {rows.map((row) => (
        <div key={row.className} className={row.className}>
          {row.ids.map((id) => {
            return (
              <DraggableCard
                key={id}
                id={id}
                canDrag={canDrag}
                canMove={canMoveMobile}
                dragId={dragId}
                dragOverId={dragOverId}
                setDragId={setDragId}
                setDragOverId={setDragOverId}
                onSwap={swapCards}
                swapSelected={swapSelected}
                onCardTap={handleCardTap}
              >
                {id === "hero" || !lazyCards ? (
                  renderCard(id)
                ) : (
                  <LazyMount id={id}>{renderCard(id)}</LazyMount>
                )}
              </DraggableCard>
            );
          })}
        </div>
      ))}
    </>
  );
}
export default function App() {
  const {
    home,
    content,
    loading,
    error,
    refresh,
    toast,
    auth,
    refreshAuth,
    editing,
    editKey,
    notify,
    beginEdit,
  } = useSite();
  useSiteTheme(
    (auth?.theme as SiteTheme | undefined) || content?.theme || "fresh",
  );
  const avatarId = home?.content.profile.avatarId;
  const fallbackIcon = themeCatAsset(home?.content.theme);
  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) return;
    favicon.type = avatarId ? "image/webp" : "image/svg+xml";
    favicon.href = avatarId ? mediaUrl(avatarId, true) : fallbackIcon;
  }, [avatarId, fallbackIcon]);
  const [panel, setPanel] = useState<{ kind: Panel; id?: string } | null>(null),
    [editor, setEditor] = useState<EditorSection | null>(null),
    [login, setLogin] = useState(location.pathname === "/login"),
    [loginMode, setLoginMode] = useState<"login" | "signup">("login");
  // 2FA 过渡：旧 session 缺两步验证标记时，自动弹出登录框并直达验证码步骤
  const dismissed2fa = useRef(false);
  const prevNeeds2fa = useRef(false);
  useEffect(() => {
    const cur = !!auth?.needs2fa;
    if (cur && !prevNeeds2fa.current) dismissed2fa.current = false;
    prevNeeds2fa.current = cur;
    if (cur && !login && !dismissed2fa.current) setLogin(true);
  }, [auth?.needs2fa, login]);
  const route = usePageNavigation();
  // 导航栏滚动毛玻璃：滚动超过 40px 时 header 加 .scrolled
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // 移动端手势：边缘右滑返回、顶部下拉刷新（PC/编辑模式/弹窗中自动停用）
  useAppGestures();
  const [inbox, setInbox] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"site" | "personal">("site");
  const [usersOpen, setUsersOpen] = useState(false);
  const [uploadCat, setUploadCat] = useState<"music" | null>(null);
  const [communityReviewOpen, setCommunityReviewOpen] = useState(false);
  // 底栏「微信」入口：复用收款设置里的站长微信号（公开接口 /api/pay/manual/config）
  const [wechatId, setWechatId] = useState("");
  useEffect(() => {
    let cancelled = false;
    request<{ wechatId?: string }>("/api/pay/manual/config")
      .then((d) => {
        if (!cancelled && d?.wechatId) setWechatId(d.wechatId);
      })
      .catch(() => {
        /* 未配置或网络失败时不展示微信入口 */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const copyWechatId = async () => {
    if (!wechatId) return;
    try {
      await navigator.clipboard.writeText(wechatId);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = wechatId;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(ta);
    }
    notify("微信号已复制，打开微信添加好友吧。");
  };
  useEffect(() => {
    if (!editing) setEditor(null);
  }, [editing]);
  const main = useRef<HTMLElement>(null);
  const previousRoute = useRef({ page: route.page, id: route.id });
  const now = useClock();
  const savedTimeZone = home?.content.location.timeZone;
  useEffect(() => {
    if (savedTimeZone) return watchSiteDay(savedTimeZone, refreshAuth);
  }, [savedTimeZone]);
  useEffect(() => {
    const previous = previousRoute.current;
    const changedPage = previous.page !== route.page;
    const changedDetail =
      previous.id !== route.id &&
      (route.page === "projects" ||
        route.page === "articles" ||
        route.page === "collections");
    previousRoute.current = { page: route.page, id: route.id };
    if (changedPage || changedDetail) {
      main.current?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    }
    setPanel(null);
    if (content) {
      document.title = `${pageTitles[route.page]} · ${content.profile.name}`;
      if (changedPage || changedDetail)
        main.current?.focus({ preventScroll: true });
    }
  }, [route.page, route.id, content?.profile.name]);
  const open = (kind: Panel, id?: string) => {
    if (Object.hasOwn(sectionNames, kind)) route.navigate(kind as Section, id);
    else setPanel({ kind, id });
  };
  const actions = { open, edit: setEditor };
  // 数据加载中：骨架屏占位（与真实版面同尺寸，不白屏、不布局跳动）；
  // 加载失败：保留原错误页 + 重试按钮
  if (!content) {
    if (error)
      return (
        <div className="loading-page">
          <Cat />
          <h1>暂时没有连接上首页。</h1>
          <p>{error}</p>
          <button className="button dark" onClick={() => void refresh()}>
            重新加载
            <ArrowRight size={16} />
          </button>
        </div>
      );
    return <HomeSkeleton />;
  }
  return (
    <>
      <a className="skip-link" href="#main">
        跳到页面内容
      </a>
      <TrialRenewNudge />
      <div
        className={`site-shell ${route.page !== "home" ? "section-shell" : ""}`}
      >
        <AdminBar
          onLogin={() => setLogin(true)}
          onMessages={() => setInbox(true)}
          onTheme={() => {
            setThemeMode("site");
            setThemeOpen(true);
          }}
          onMyTheme={() => {
            setThemeMode("personal");
            setThemeOpen(true);
          }}
          onUsers={() => setUsersOpen(true)}
          onCommunityReview={() => setCommunityReviewOpen(true)}
          onCardBackgrounds={() => {
            beginEdit();
            setEditor("cardBackgrounds");
          }}
        />
        <header className={`site-header${scrolled ? " scrolled" : ""}`}>
          <a
            className="brand"
            aria-label={`${content.profile.name} 首页`}
            href="/"
            onClick={(event) => route.follow(event, "home")}
          >
            <span>{content.profile.name.toLowerCase()}</span>
          </a>
          <nav aria-label="主导航">
            <a href="/" className={route.page === "home" ? "active" : ""} onClick={(e) => route.follow(e, "home")}>首页</a>
            <a href="/community" className={route.page === "community" ? "active" : ""} onClick={(e) => route.follow(e, "community")}>社区</a>
            <a href="/about" className={route.page === "about" ? "active" : ""} onClick={(e) => route.follow(e, "about")}>关于</a>
            <a href="/teacher" className={route.page === "teacher" ? "active" : ""} onClick={(e) => route.follow(e, "teacher")}>关于我</a>
          </nav>
          <div className="header-contact">
            <UserAvatarMenu onMyTheme={() => { setThemeMode("personal"); setThemeOpen(true); }} />
            <span>
              <i />
              <span
                className="header-location-name"
                title={[content.location.name, content.location.region]
                  .filter(Boolean)
                  .join(", ")}
              >
                {[content.location.name, content.location.region]
                  .filter(Boolean)
                  .join(", ")
                  .toUpperCase()}
              </span>
              <EditButton
                label="编辑顶部地点"
                onClick={() => setEditor("location")}
              />
            </span>
            <button className="button ghost-gold" onClick={() => open("contact")}>
              聊聊
              <ArrowUpRight size={16} />
            </button>
          </div>
        </header>
        <main
          ref={main}
          id="main"
          tabIndex={-1}
          className={
            route.page === "home"
              ? "bento-grid"
              : `section-page section-${route.page}`
          }
        >
          {route.page === "home" ? (
            <HomeGrid
              key={`homegrid-${editKey}`}
              actions={actions}
              now={now}
              setEditor={setEditor}
              setLogin={setLogin}
              setUploadCat={setUploadCat}
              route={route}
              onSignup={() => {
                setLoginMode("signup");
                setLogin(true);
              }}
            />
          ) : route.page === "community" ? (
            <CommunityPage onLogin={() => setLogin(true)} onReview={() => setCommunityReviewOpen(true)} />
          ) : route.page === "about" ? (
            <Suspense fallback={null}>
              <AboutSection about={content.about} onEdit={() => setEditor("about")} />
            </Suspense>
          ) : route.page === "teacher" ? (
            <Suspense fallback={null}>
              <TeacherSection
                teacher={content.teacher}
                onEdit={() => setEditor("teacher")}
              />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <ContentPage
                key={route.page}
                panel={route.page}
                id={route.id}
                onSelect={(id) => route.navigate(route.page, id)}
                onEdit={() => setEditor(route.page as Section)}
              />
            </Suspense>
          )}
        </main>
        <footer className="site-footer">
          <span>
            © {zonedDay(now, content.location.timeZone).slice(0, 4)}{" "}
            {content.profile.name}
          </span>
          {route.page !== "home" && <SectionPlayer />}
          <div>
            {wechatId && (
              <button
                type="button"
                onClick={copyWechatId}
                aria-label="微信（点击复制微信号）"
                title={wechatId}
              >
                微信
              </button>
            )}
            {content.social.youtube && (
              <a
                href={content.social.youtube}
                target="_blank"
                rel="noreferrer"
                aria-label="YouTube"
              >
                YouTube
              </a>
            )}
            {content.social.xiaohongshu && (
              <a href={content.social.xiaohongshu} target="_blank" rel="noreferrer" aria-label="小红书">小红书</a>
            )}
            {content.social.bilibili && (
              <a href={content.social.bilibili} target="_blank" rel="noreferrer" aria-label="Bilibili">Bilibili</a>
            )}
            <button onClick={() => open("sources")}>开源致谢</button>
            <button onClick={() => setLogin(true)}>
              {auth?.authenticated ? "管理员" : "管理"}
            </button>
            <Editable field="motto" as="span" className="footer-motto" />
            <span className="footer-star">✳</span>
          </div>
        </footer>
      </div>
      <MusicBottomBar onUpload={() => setUploadCat("music")} />
      {panel && (
        <Suspense fallback={<ModalFallback onClose={() => setPanel(null)} />}>
          <ContentDialog
            key={`${panel.kind}:${panel.id}`}
            panel={panel.kind}
            id={panel.id}
            onClose={() => setPanel(null)}
            onEdit={
              panel.kind === "about"
                ? () => {
                    setPanel(null);
                    setEditor("profile");
                  }
                : undefined
            }
          />
        </Suspense>
      )}{" "}
      {editor && (
        <Suspense fallback={<ModalFallback onClose={() => setEditor(null)} />}>
          <Editor
            key={editor}
            section={editor}
            onClose={() => setEditor(null)}
          />
        </Suspense>
      )}{" "}
      {inbox && auth?.authenticated && (
        <Suspense fallback={<ModalFallback onClose={() => setInbox(false)} />}>
          <InboxDialog
            onClose={() => setInbox(false)}
            onLogin={() => {
              setInbox(false);
              setLogin(true);
            }}
          />
        </Suspense>
      )}
      {themeOpen && auth?.authenticated && (
        <Suspense
          fallback={<ModalFallback onClose={() => setThemeOpen(false)} />}
        >
          <ThemePicker
            mode={themeMode}
            onClose={() => setThemeOpen(false)}
          />
        </Suspense>
      )}
      {usersOpen && auth?.isAdmin && (
        <Suspense
          fallback={<ModalFallback onClose={() => setUsersOpen(false)} />}
        >
          <UsersDialog onClose={() => setUsersOpen(false)} />
        </Suspense>
      )}
      {communityReviewOpen && auth?.isAdmin && (
        <CommunityReviewDialog onClose={() => setCommunityReviewOpen(false)} />
      )}
      {uploadCat && auth?.isAdmin && (
        <Suspense
          fallback={<ModalFallback onClose={() => setUploadCat(null)} />}
        >
          <BatchUploadDialog onClose={() => setUploadCat(null)} />
        </Suspense>
      )}
      {login && (
        <LoginDialog
          initialStep={auth?.needs2fa ? "code" : undefined}
          initialMode={loginMode}
          onClose={() => {
            if (auth?.needs2fa) dismissed2fa.current = true;
            setLogin(false);
            setLoginMode("login");
            if (location.pathname === "/login")
              history.replaceState(null, "", "/");
          }}
        />
      )}
      <WelcomePopup
        onRegister={() => {
          setLoginMode("signup");
          setLogin(true);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Cat />
          {toast}
        </div>
      )}
      {loading && (
        <span className="refresh-indicator" role="status">
          正在更新…
        </span>
      )}
    </>
  );
}
