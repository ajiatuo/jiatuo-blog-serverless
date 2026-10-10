import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Check,
  Palette,
  ShieldAlert,
  ShieldCheck,
  Image as ImageIcon,
} from "lucide-react";
import { Dialog, Cat } from "./Common";
import { useSite } from "../store";
import { request } from "../api";
import { useMembership, membershipLabel } from "./WelcomePopup";
import type { VisitorState } from "../../../shared/model";
import { useDialogLayer } from "../dialogLayers";
export function LoginDialog({
  onClose,
  initialStep,
  initialMode,
}: {
  onClose: () => void;
  /** 2FA 过渡状态：已有旧 session，直接进入验证码步骤（跳过密码输入） */
  initialStep?: "password" | "code";
  /** 打开时默认的 tab：访客弹窗/社区卡片点「注册」时直接进注册页 */
  initialMode?: "login" | "signup";
}) {
  const { auth, refreshAuth, refreshVip, notify } = useSite();
  const [mode, setMode] = useState<"login" | "signup">(initialMode ?? "login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [token, setToken] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  // 记住我：默认勾选，7 天内免登录；取消勾选则关闭浏览器后 session 失效
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem("momo-remember-me") !== "0";
    } catch {
      return true;
    }
  });
  // 邮箱两步验证状态
  const [step, setStep] = useState<"password" | "code">(initialStep ?? "password"),
    [code, setCode] = useState(""),
    [codeError, setCodeError] = useState(""),
    [expiresAt, setExpiresAt] = useState(0),
    [cooldown, setCooldown] = useState(0),
    [nowTick, setNowTick] = useState(Date.now());
  // 浏览器自动填充不触发 onChange：用 animationstart 把填充值同步到 state，
  // 否则 React 重渲染时会按空 state 把填充值清空，导致点登录报"请填写此字段"
  const syncAutofill = (e: React.AnimationEvent<HTMLInputElement>) => {
    if (e.animationName !== "autofill-start") return;
    const el = e.currentTarget;
    if (el.type === "password") setPassword(el.value);
    else if (el.type === "email") setEmail(el.value);
  };
  const setup = auth?.initialized === false;
  const signup = !setup && mode === "signup";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      if (setup)
        await request("/api/setup", {
          method: "POST",
          body: JSON.stringify({ token, email, password }),
        });
      else if (signup) {
        await request("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim() || email.split("@")[0],
            email,
            password,
          }),
        });
        setMode("login");
        setPassword("");
        setName("");
        notify("注册成功！已赠送 7 天体验会员，免费畅听全部课程。");
        await refreshAuth();
        onClose();
        return;
      } else {
        try {
          localStorage.setItem("momo-remember-me", rememberMe ? "1" : "0");
        } catch {
          /* 忽略存储失败 */
        }
        await request("/api/auth/sign-in/email", {
          method: "POST",
          body: JSON.stringify({ email, password, rememberMe }),
        });
        // 管理员需要邮箱二次验证
        const state = await request<VisitorState>("/api/state");
        if (state.auth.needs2fa) {
          const rc = await request<{
            ok: boolean;
            alreadyVerified?: boolean;
            expiresIn?: number;
          }>("/api/admin/request-code", { method: "POST" });
          await refreshAuth();
          if (rc.alreadyVerified) {
            await refreshVip().catch(() => {});
            notify("已登录。");
            onClose();
            return;
          }
          setCode("");
          setCodeError("");
          setExpiresAt(Date.now() + (rc.expiresIn || 300) * 1000);
          setNowTick(Date.now());
          setCooldown(60);
          setStep("code");
          return;
        }
      }
      await refreshAuth();
      await refreshVip().catch(() => {});
      notify(setup ? "已登录，可以直接编辑首页。" : "已登录。");
      onClose();
    } catch (e) {
      setError((e as Error).message);
      await refreshAuth().catch(() => {});
    } finally {
      setPending(false);
    }
  };
  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError("请输入 6 位数字验证码。");
      return;
    }
    setPending(true);
    setCodeError("");
    try {
      await request("/api/admin/verify-code", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      await refreshAuth();
      await refreshVip().catch(() => {});
      notify("验证通过，已登录。");
      onClose();
    } catch (e) {
      setCodeError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const resendCode = async () => {
    if (cooldown > 0 || pending) return;
    setPending(true);
    setCodeError("");
    try {
      const rc = await request<{ ok: boolean; expiresIn?: number }>(
        "/api/admin/request-code",
        { method: "POST" },
      );
      setExpiresAt(Date.now() + (rc.expiresIn || 300) * 1000);
      setNowTick(Date.now());
      setCooldown(60);
      notify("验证码已重新发送。");
    } catch (e) {
      setCodeError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  // 验证码步骤的倒计时（有效期 + 重发冷却）
  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => {
      setNowTick(Date.now());
      setCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);
  // 2FA 过渡状态进入：挂载即自动请求验证码（session 仍在，无需再输密码）
  // 幂等 guard：同一挂载周期内只发一次，防止 effect 重复执行导致刚收到的码被作废。
  // 重发只能由用户点 resendCode 按钮触发。
  const autoCodeSentRef = useRef(false);
  useEffect(() => {
    if (initialStep !== "code") return;
    if (autoCodeSentRef.current) return;
    autoCodeSentRef.current = true;
    let cancelled = false;
    (async () => {
      setPending(true);
      setCodeError("");
      try {
        const rc = await request<{
          ok: boolean;
          alreadyVerified?: boolean;
          expiresIn?: number;
        }>("/api/admin/request-code", { method: "POST" });
        if (cancelled) return;
        if (rc.alreadyVerified) {
          await refreshAuth();
          await refreshVip().catch(() => {});
          notify("已登录。");
          onClose();
          return;
        }
        setCode("");
        setExpiresAt(Date.now() + (rc.expiresIn || 300) * 1000);
        setNowTick(Date.now());
        setCooldown(60);
      } catch (e) {
        if (!cancelled) setCodeError((e as Error).message);
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remainSec = Math.max(0, Math.ceil((expiresAt - nowTick) / 1000));
  return (
    <Dialog
      title={
        step === "code"
          ? "邮箱验证"
          : setup
            ? "创建你的管理员账号"
            : signup
              ? "注册学员账号"
              : "欢迎回来。"
      }
      eyebrow="YOUR PERSONAL SPACE"
      busy={pending}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {step === "code" ? (
        <form className="auth-form" onSubmit={submitCode}>
          <Cat />
          <p>
            验证码已发送到管理员邮箱，
            {remainSec > 0
              ? `请在 ${Math.floor(remainSec / 60)}:${String(remainSec % 60).padStart(2, "0")} 内输入。`
              : "已过期，请重新发送。"}
          </p>
          <label>
            邮箱验证码
            <input
              aria-label="邮箱验证码"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 位数字"
            />
          </label>
          {codeError && (
            <p role="alert" className="form-error">
              {codeError}
            </p>
          )}
          <button
            className="button dark"
            disabled={pending || code.length !== 6}
          >
            {pending ? "验证中…" : "验证并登录"}
            <ArrowUpRight size={16} />
          </button>
          <button
            type="button"
            className="button"
            disabled={pending || cooldown > 0}
            onClick={() => void resendCode()}
          >
            {cooldown > 0 ? `重新发送（${cooldown}s）` : "重新发送验证码"}
          </button>
        </form>
      ) : (
        <>
          {!setup && (
        <div className="auth-tabs" role="tablist" aria-label="登录或注册">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "active" : ""}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              disabled={pending}
              type="button"
            >
              {m === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>
      )}
      <form className="auth-form" onSubmit={submit}>
        <Cat />
        <p>
          {setup
            ? "只需初始化一次，之后登录即可在首页修改内容。"
            : signup
              ? "注册即送 7 天体验会员，全部冥想课程免费畅听。"
              : "登录后，点击页面底部悬浮栏的「编辑页面」。"}
        </p>
        {setup && (
          <label>
            初始化令牌
            <input
              aria-label="初始化令牌"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoComplete="off"
            />
            <small>
              在此项目的 data/setup-token.txt 中查看，仅保存在你的电脑上。
            </small>
          </label>
        )}
        <label>
          邮箱
          <input
            type="email"
            aria-label="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onAnimationStart={syncAutofill}
            required
            autoComplete="username"
          />
        </label>
        {signup && (
          <label>
            昵称
            <input
              aria-label="昵称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              placeholder="不填则用邮箱前缀"
            />
          </label>
        )}
        <label>
          密码
          <input
            type="password"
            aria-label="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onAnimationStart={syncAutofill}
            required
            minLength={12}
            autoComplete={setup ? "new-password" : signup ? "new-password" : "current-password"}
          />
          {(setup || signup) && <small>至少 12 位字符。</small>}
        </label>
        {!setup && !signup && (
          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            记住我（7 天内免登录）
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button dark" disabled={pending || !auth}>
          {pending ? "请稍候…" : setup ? "创建并登录" : signup ? "注册" : "登录"}
          <ArrowUpRight size={16} />
        </button>
      </form>
        </>
      )}
    </Dialog>
  );
}
interface LoginRecord {
  ip: string;
  city: string;
  user_agent: string;
  created_at: string;
}

/** 从 User-Agent 提取简短设备描述，如 "Chrome · Mac" */
function parseDevice(ua: string): string {
  if (!ua) return "未知设备";
  let os = "";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "安卓";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Macintosh/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  let browser = "";
  if (/MicroMessenger/.test(ua)) browser = "微信";
  else if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : "未知设备";
}

/** "2026-10-08 02:04:01"（UTC）→ 本地时间字符串 */
function fmtLoginTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 管理员登录提醒：仅管理员可见；本次与上次城市不同时黄色警告（同城换 IP 不报警） */
function LoginAlert() {
  const { auth } = useSite();
  const [open, setOpen] = useState(false);
  const [logins, setLogins] = useState<LoginRecord[] | null>(null);
  const isAdmin = !!auth?.isAdmin;
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    request<{ logins: LoginRecord[] }>("/api/admin/last-login")
      .then((d) => {
        if (!cancelled) setLogins(d.logins ?? []);
      })
      .catch(() => {
        if (!cancelled) setLogins([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, auth?.authenticated]);
  if (!isAdmin || !logins || logins.length === 0) return null;
  const [current, previous] = logins;
  // 显示：优先城市；解析失败显示“未知位置”，不再暴露原始 IP（尤其裸 IPv6 地址）
  const labelOf = (r: LoginRecord) => r.city || "未知位置";
  // 异地判断：仅当两边城市都已知且不同时才报警；城市未知时不误报（避免同城换 IP 误报）
  const prevCity = previous?.city || "";
  const currCity = current.city || "";
  const changed = !!prevCity && !!currCity && prevCity !== currCity;
  return (
    <>
      <button
        type="button"
        className={`login-alert${changed ? " warn" : ""}`}
        onClick={() => setOpen(true)}
        title="查看登录记录"
      >
        {changed ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
        {changed ? "异地登录提醒" : `上次登录 ${labelOf(previous ?? current)}`}
      </button>
      {open && (
        <Dialog title="登录提醒" eyebrow="SECURITY" onClose={() => setOpen(false)} noLayer>
          <div className="login-log">
            {changed && (
              <p className="login-log-warn" role="alert">
                检测到异地登录（{prevCity} → {currCity}），请确认是否为本人操作。如非本人，请立即修改密码。
              </p>
            )}
            <div className="login-log-row">
              <span className="login-log-label">本次登录</span>
              <strong>{fmtLoginTime(current.created_at)}</strong>
              <span>{labelOf(current)}</span>
              <span>{parseDevice(current.user_agent)}</span>
            </div>
            {previous && (
              <div className="login-log-row">
                <span className="login-log-label">上次登录</span>
                <strong>{fmtLoginTime(previous.created_at)}</strong>
                <span>{labelOf(previous)}</span>
                <span>{parseDevice(previous.user_agent)}</span>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}

export function AdminBar({
  onLogin,
  onMessages,
  onTheme,
  onMyTheme,
  onUsers,
  onStats,
  onBatchUpload,
  onStudentProgress,
  onCommunityReview,
  onPaySettings,
  onPayOrders,
  onCardBackgrounds,
}: {
  onLogin: () => void;
  onMessages: () => void;
  onTheme: () => void;
  onMyTheme: () => void;
  onUsers: () => void;
  onStats?: () => void;
  onBatchUpload?: () => void;
  onStudentProgress?: () => void;
  onCommunityReview: () => void;
  onPaySettings?: () => void;
  onPayOrders?: () => void;
  onCardBackgrounds: () => void;
}) {
  const {
    auth,
    editing,
    dirty,
    saving,
    saveError,
    beginEdit,
    save,
    cancelEdit,
    requestCancelEdit,
    cancelConfirmOpen,
    dismissCancelConfirm,
    refreshAuth,
    notify,
  } = useSite();
  const layer = useDialogLayer();
  const controlsBusy = saving || layer?.busy;
  // 手动付款待确认数量（红点 badge；订单处理后由 ManualOrdersDialog 派发事件刷新）
  const [pendingCount, setPendingCount] = useState(0);
  // 管理工具栏收起状态（localStorage 记住）
  const [barCollapsed, setBarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("hejia-homepage:admin-bar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleBarCollapsed = () => {
    setBarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("hejia-homepage:admin-bar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };
  useEffect(() => {
    if (!auth?.isAdmin) return;
    let cancelled = false;
    const load = () => {
      request<{ count: number }>("/api/admin/pay/manual/pending-count")
        .then((d) => {
          if (!cancelled) setPendingCount(d.count || 0);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("manual-orders-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("manual-orders-changed", load);
    };
  }, [auth?.isAdmin, auth?.authenticated]);
  if (!auth?.authenticated && !editing) return null;
  const isAdmin = !!auth?.isAdmin;
  const logout = async () => {
    try {
      await request("/api/auth/sign-out", {
        method: "POST",
        body: "{}",
      });
      await refreshAuth();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  // 普通学员登录：底部 pill 已取消，改用右上角头像下拉菜单（UserAvatarMenu）
  // 此处不再渲染任何内容，避免与音乐悬浮钮重叠
  if (!isAdmin && !editing) {
    return null;
  }
  return createPortal(
    <>
    {barCollapsed ? (
      // 收起态：左下角小圆钮，点击展开
      <button
        className="admin-bar-fab"
        aria-label="展开管理员工具栏"
        title="管理员工具栏（点击展开）"
        onClick={toggleBarCollapsed}
      >
        <ShieldCheck size={18} />
        {pendingCount > 0 && (
          <span className="admin-bar-fab-badge">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </button>
    ) : (
    <div
      className={`admin-bar ${saveError ? "has-error" : ""}`}
      role="region"
      aria-label="管理员工具栏"
    >
      <div className="admin-bar-main">
        <span>
          <span className="green-dot" />
          {editing
            ? dirty
              ? "有尚未保存的修改"
              : "正在编辑首页"
            : "管理员已登录"}
        </span>
        {!editing && <LoginAlert />}
        <div>
          <button
            className="admin-theme"
            data-admin-action="theme"
            onClick={onTheme}
            disabled={controlsBusy || !auth?.authenticated}
            aria-haspopup="dialog"
          >
            <Palette size={14} />
            更换主题
          </button>
          <button
            onClick={onCardBackgrounds}
            disabled={controlsBusy}
            data-admin-action="card-backgrounds"
            aria-haspopup="dialog"
          >
            <ImageIcon size={14} />
            卡片背景
          </button>
          {editing ? (
            <>
              <button
                onClick={requestCancelEdit}
                disabled={controlsBusy}
                data-admin-action="cancel"
              >
                取消
              </button>
              <button
                className="admin-save"
                data-admin-action="save"
                onClick={() => void save()}
                disabled={controlsBusy}
              >
                {saving ? "保存中…" : "保存修改"}
                <Check size={14} />
              </button>
              {saveError.includes("登录") && (
                <button
                  onClick={onLogin}
                  disabled={controlsBusy}
                  data-admin-action="login"
                >
                  重新登录
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onMessages}
                disabled={controlsBusy}
                data-admin-action="messages"
              >
                留言箱
              </button>
              <button
                onClick={onUsers}
                disabled={controlsBusy}
                data-admin-action="users"
                aria-haspopup="dialog"
              >
                用户管理
              </button>
              <button
                onClick={onStats}
                disabled={controlsBusy}
                data-admin-action="play-stats"
                aria-haspopup="dialog"
                style={{ display: onStats ? undefined : "none" }}
              >
                播放统计
              </button>
              <button
                onClick={onBatchUpload}
                disabled={controlsBusy}
                aria-haspopup="dialog"
                style={{ display: onBatchUpload ? undefined : "none" }}
              >
                批量上传
              </button>
              <button
                onClick={onStudentProgress}
                disabled={controlsBusy}
                aria-haspopup="dialog"
                style={{ display: onStudentProgress ? undefined : "none" }}
              >
                学员进度
              </button>
              <button
                onClick={onCommunityReview}
                disabled={controlsBusy}
                aria-haspopup="dialog"
              >
                社区审核
              </button>
              <button
                onClick={onPaySettings}
                disabled={controlsBusy}
                data-admin-action="pay-settings"
                aria-haspopup="dialog"
                style={{ display: onPaySettings ? undefined : "none" }}
              >
                收款设置
              </button>
              <button
                onClick={onPayOrders}
                disabled={controlsBusy}
                data-admin-action="pay-orders"
                aria-haspopup="dialog"
                style={{ position: "relative", display: onPayOrders ? undefined : "none" }}
              >
                待确认订单
                {pendingCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: "#e5484d",
                      color: "#fff",
                      fontSize: 11,
                      lineHeight: "18px",
                      textAlign: "center",
                      padding: "0 4px",
                    }}
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
              <button
                className="admin-save"
                onClick={beginEdit}
                disabled={controlsBusy}
                data-admin-action="edit"
              >
                编辑页面
              </button>
              <button
                disabled={controlsBusy}
                data-admin-action="logout"
                onClick={() => void logout()}
              >
                退出登录
              </button>
            </>
          )}
        </div>
      </div>
      {saveError && (
        <div className="save-error" role="alert">
          {saveError}
        </div>
      )}
      <button
        className="admin-bar-collapse"
        aria-label="收起管理员工具栏"
        title="收起"
        onClick={toggleBarCollapsed}
      >
        收起 ↑
      </button>
    </div>
    )}
    {cancelConfirmOpen && (
      <Dialog
        title="放弃这次的修改？"
        eyebrow="确认"
        onClose={dismissCancelConfirm}
        noLayer
      >
        <p>还有尚未保存的修改，放弃后首页会回到上次保存的样子。</p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            marginTop: 16,
          }}
        >
          <button
            type="button"
            className="button"
            onClick={dismissCancelConfirm}
          >
            继续编辑
          </button>
          <button
            type="button"
            className="button dark"
            onClick={() => void cancelEdit()}
          >
            放弃修改
          </button>
        </div>
      </Dialog>
    )}
    </>,
    layer?.element ?? document.body,
  );
}

// 右上角用户头像下拉菜单（5A）：替代普通用户的底部 pill
// 放在 header-contact 内，「聊聊」按钮左侧；管理员不显示（用工作条）
export function UserAvatarMenu({ onMyTheme }: { onMyTheme: () => void }) {
  const { auth, vip, refreshAuth, notify } = useSite();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const membership = useMembership();
  const memberLabel = membershipLabel(membership);
  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!auth?.authenticated || auth?.isAdmin) return null;
  const logout = async () => {
    try {
      await request("/api/auth/sign-out", { method: "POST", body: "{}" });
      await refreshAuth();
      setOpen(false);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const initial = ((auth as { name?: string }).name || auth.email || "?")
    .trim()[0]
    ?.toUpperCase() || "?";
  const canPickTheme = !!vip?.unlocked;
  return (
    <div className="user-avatar-menu" ref={menuRef}>
      <button
        className={`avatar-btn${memberLabel ? " is-member" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="用户菜单"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div className="avatar-dropdown" role="menu">
          <div className="avatar-dropdown-head">
            <div className="avatar-dropdown-name">
              {(auth as { name?: string }).name || auth.email?.split("@")[0]}
            </div>
            <div className="avatar-dropdown-email">{auth.email}</div>
            {memberLabel && (
              <span className="member-badge">{memberLabel}</span>
            )}
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("open-purchase"));
            }}
          >
            我的会员
          </button>
          {canPickTheme && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMyTheme();
              }}
            >
              <Palette size={14} />
              我的主题
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
          >
            用户资料
          </button>
          <button role="menuitem" onClick={() => void logout()}>
            退出登录
          </button>
        </div>
      )}
      {profileOpen && (
        <Dialog title="用户资料" onClose={() => setProfileOpen(false)}>
          <div className="profile-dialog">
            <p>
              <span>昵称</span>
              {(auth as { name?: string }).name || "—"}
            </p>
            <p>
              <span>邮箱</span>
              {auth.email}
            </p>
            <p>
              <span>会员</span>
              {memberLabel || "非会员"}
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
