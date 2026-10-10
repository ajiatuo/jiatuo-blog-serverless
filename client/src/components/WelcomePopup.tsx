import { useEffect, useState } from "react";
import { Sparkles, X, ArrowUpRight, Flower2, Users } from "lucide-react";
import { Dialog } from "./Common";
import { useSite } from "../store";
import { request } from "../api";

// —— 访客欢迎弹窗 ——
// 首次访问 3 秒后弹出；点「稍后再说」7 天内不再打扰；已登录用户永不弹出。
const LS_KEY = "hx-welcome-v1";
const SNOOZE_MS = 7 * 86_400_000;

function readSnoozeUntil(): number {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return 0;
    const d = JSON.parse(raw) as { snoozeUntil?: number };
    return Number(d?.snoozeUntil) || 0;
  } catch {
    return 0;
  }
}
function snooze() {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ v: 1, snoozeUntil: Date.now() + SNOOZE_MS }),
    );
  } catch {
    /* 忽略存储失败 */
  }
}

export function WelcomePopup({ onRegister }: { onRegister: () => void }) {
  const { auth } = useSite();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (auth?.authenticated) return;
    if (readSnoozeUntil() > Date.now()) return;
    const t = setTimeout(() => setOpen(true), 3000);
    return () => clearTimeout(t);
  }, [auth?.authenticated]);
  if (!open) return null;
  const later = () => {
    snooze();
    setOpen(false);
  };
  const go = () => {
    snooze();
    setOpen(false);
    onRegister();
  };
  return (
    <Dialog
      title="欢迎来到My Blog"
      eyebrow="WELCOME"
      onClose={later}
      className="welcome-popup"
    >
      <div className="welcome-popup-body">
        <div className="welcome-popup-badge">
          <Sparkles size={16} />
          新人专享
        </div>
        <h3>
          免费注册，领取 <em>7 天正念冥想调频</em>
        </h3>
        <ul className="welcome-popup-perks">
          <li>
            <Flower2 size={16} />
            7 天会员体验：全部冥想课程免费畅听
          </li>
          <li>
            <Users size={16} />
            会员社区：知识分享与修习经验交流
          </li>
        </ul>
        <p className="welcome-popup-note">
          无需付费，注册即送。到期后可按需续费。
        </p>
        <div className="welcome-popup-actions">
          <button className="button dark" onClick={go}>
            立即免费注册
            <ArrowUpRight size={16} />
          </button>
          <button className="button" onClick={later}>
            稍后再说
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// —— 会员状态 ——
export interface Membership {
  vipExpiresAt: number | null;
  vipSource: string | null;
  daysLeft: number;
}

export function useMembership(): Membership | null {
  const { auth } = useSite();
  const [m, setM] = useState<Membership | null>(null);
  useEffect(() => {
    if (!auth?.authenticated || auth?.isAdmin) {
      setM(null);
      return;
    }
    let cancelled = false;
    request<{
      vipExpiresAt: number | null;
      vipSource: string | null;
      vipDaysLeft: number;
    }>("/api/user/me")
      .then((d) => {
        if (!cancelled)
          setM({
            vipExpiresAt: d.vipExpiresAt ?? null,
            vipSource: d.vipSource ?? null,
            daysLeft: d.vipDaysLeft ?? 0,
          });
      })
      .catch(() => {
        /* 忽略，会员徽标不显示即可 */
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.authenticated, auth?.isAdmin]);
  return m;
}

/** 会员徽标文案：体验会员（剩 X 天）/ 会员（剩 X 天）/ null */
export function membershipLabel(m: Membership | null): string | null {
  if (!m || m.daysLeft <= 0) return null;
  return m.vipSource === "trial"
    ? `体验会员 · 剩 ${m.daysLeft} 天`
    : `会员 · 剩 ${m.daysLeft} 天`;
}

// —— 体验会员到期提醒（剩 ≤2 天时顶部细条提醒，可关闭） ——
export function TrialRenewNudge() {
  const m = useMembership();
  const [dismissed, setDismissed] = useState(false);
  if (!m || dismissed) return null;
  if (m.vipSource !== "trial" || m.daysLeft <= 0 || m.daysLeft > 2)
    return null;
  return (
    <div className="trial-nudge" role="status">
      <Sparkles size={15} />
      <span>
        体验会员还剩 {m.daysLeft} 天，到期后课程将无法继续收听。
        <a href="/courses">续费开通 →</a>
      </span>
      <button aria-label="关闭提醒" onClick={() => setDismissed(true)}>
        <X size={14} />
      </button>
    </div>
  );
}
