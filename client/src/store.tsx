import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { request } from "./api";
import {
  contentSchema,
  type HomeContent,
  type HomeResponse,
  type VisitorState,
  type Stats,
  type AuthStatus,
  type SiteTheme,
} from "../../shared/model";
interface VipStatus {
  enabled: boolean;
  unlocked: boolean;
}
interface SiteStore {
  home: HomeResponse | null;
  content: HomeContent | null;
  auth: AuthStatus | null;
  stats: Stats | null;
  vip: VipStatus | null;
  loading: boolean;
  error: string;
  toast: string;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  saveError: string;
  refresh: () => Promise<void>;
  refreshAuth: (signal?: AbortSignal) => Promise<void>;
  refreshVip: () => Promise<void>;
  unlockVip: (password: string) => Promise<void>;
  beginEdit: () => void;
  setTheme: (theme: SiteTheme) => void;
  cancelEdit: () => Promise<void>;
  /** 取消编辑入口：有未保存修改时先弹应用内确认框，否则直接取消 */
  requestCancelEdit: () => void;
  /** 取消确认框是否打开 */
  cancelConfirmOpen: boolean;
  /** 关闭取消确认框（继续编辑） */
  dismissCancelConfirm: () => void;
  change: (fn: (content: HomeContent) => HomeContent) => void;
  save: () => Promise<void>;
  saveContent: (content: HomeContent) => Promise<void>;
  notify: (text: string) => void;
  checkin: () => Promise<void>;
  like: () => Promise<void>;
  /** 编辑会话 key：beginEdit/cancelEdit/save 时递增，用于强制重挂载编辑相关 UI */
  editKey: number;
}
const Context = createContext<SiteStore>(null!);
export const useSite = () => useContext(Context);
export function SiteProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomeResponse | null>(null),
    [auth, setAuth] = useState<AuthStatus | null>(null),
    [stats, setStats] = useState<Stats | null>(null),
    [vip, setVip] = useState<VipStatus | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<HomeContent | null>(null),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    [toast, setToast] = useState("");
  // 编辑会话 key：递增以强制重挂载 HomeGrid，确保取消/保存后 UI 彻底重置
  const [editKey, setEditKey] = useState(0);
  // 取消编辑的二次确认框开关：应用内 Dialog，替代 window.confirm
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const pageView = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const dirty =
    !!draft && JSON.stringify(draft) !== JSON.stringify(home?.content);
  const notify = (text: string) => setToast(text);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refreshAuth = async (signal?: AbortSignal) => {
    const state = await request<VisitorState>("/api/state", { signal });
    if (signal?.aborted || !mounted.current) return;
    setAuth(state.auth);
    setStats(state.stats);
  };
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [h, state] = await Promise.all([
        request<HomeResponse>("/api/home"),
        request<VisitorState>("/api/state"),
      ]);
      if (!mounted.current) return;
      setHome(h);
      setAuth(state.auth);
      setStats(state.stats);
      if (!state.auth.authenticated && location.pathname !== "/login") {
        const counted = await request<Stats>("/api/visits", {
          method: "POST",
          body: JSON.stringify({ pageViewId: pageView.current }),
        });
        if (mounted.current) setStats(counted);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void refresh();
    void refreshVip();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = async () => {
    if (!draft || !home || saving) return;
    const validated = contentSchema.safeParse(draft);
    if (!validated.success) {
      setSaveError(`请检查内容：${validated.error.issues[0]?.message}`);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const result = await request<HomeResponse>("/api/home", {
        method: "PUT",
        body: JSON.stringify({
          revision: home.revision,
          content: validated.data,
        }),
      });
      setHome(result);
      setDraft(null);
      setEditKey((k) => k + 1);
      notify("修改已保存，首页已更新。");
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const saveContent = async (content: HomeContent) => {
    if (!home || saving) return;
    const validated = contentSchema.safeParse(content);
    if (!validated.success) {
      setSaveError(`请检查内容：${validated.error.issues[0]?.message}`);
      throw new Error(validated.error.issues[0]?.message || "内容校验失败");
    }
    setSaving(true);
    setSaveError("");
    try {
      const result = await request<HomeResponse>("/api/home", {
        method: "PUT",
        body: JSON.stringify({
          revision: home.revision,
          content: validated.data,
        }),
      });
      setHome(result);
      setDraft(validated.data);
      notify("修改已保存，首页已更新。");
    } catch (e) {
      setSaveError((e as Error).message);
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const cancelEdit = async () => {
    setCancelConfirmOpen(false);
    setDraft(null);
    setSaveError("");
    // 递增 editKey，强制 HomeGrid 重挂载，彻底丢弃拖拽等本地 UI 状态
    setEditKey((k) => k + 1);
    try {
      setHome(await request<HomeResponse>("/api/home"));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  // 取消编辑入口：有未保存修改时先弹应用内确认框，无修改时直接取消
  const requestCancelEdit = () => {
    if (dirty) setCancelConfirmOpen(true);
    else void cancelEdit();
  };
  const checkin = async () => {
    const state = await request<Stats>("/api/checkin", { method: "POST" });
    setStats(state);
    notify("签到成功，今天也留下了一个小脚印。");
  };
  const refreshVip = async () => {
    try {
      const status = await request<VipStatus>("/api/vip/status");
      if (mounted.current) setVip(status);
    } catch {
      // VIP 未启用时忽略
    }
  };
  const unlockVip = async (password: string) => {
    await request<{ unlocked: boolean }>("/api/vip/unlock", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    await refreshVip();
    notify("解锁成功，VIP 内容已开放。");
  };
  const like = async () => {
    if (!stats) return;
    const state = await request<Stats>("/api/likes", {
      method: "POST",
      body: JSON.stringify({ liked: !stats.liked }),
    });
    setStats(state);
  };
  return (
    <Context.Provider
      value={{
        home,
        content: draft || home?.content || null,
        auth,
        stats,
        vip,
        loading,
        error,
        toast,
        editing: !!draft,
        dirty,
        saving,
        saveError,
        refresh,
        refreshAuth,
        refreshVip,
        unlockVip,
        beginEdit: () => {
          if (home && auth?.authenticated) {
            setDraft((current) => current || structuredClone(home.content));
            setSaveError("");
            setEditKey((k) => k + 1);
          }
        },
        setTheme: (theme) => {
          if (!home || !auth?.authenticated || saving) return;
          setDraft((current) => ({
            ...(current || structuredClone(home.content)),
            theme,
          }));
          setSaveError("");
        },
        cancelEdit,
        requestCancelEdit,
        cancelConfirmOpen,
        dismissCancelConfirm: () => setCancelConfirmOpen(false),
        change: (fn) => setDraft((c) => (c ? fn(c) : c)),
        save,
        saveContent,
        notify,
        checkin,
        like,
        editKey,
      }}
    >
      {children}
    </Context.Provider>
  );
}
