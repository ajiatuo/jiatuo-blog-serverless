import { useCallback, useEffect, useState } from "react";
import { Check, Infinity as InfinityIcon, Trash2, X } from "lucide-react";
import { Dialog } from "./Common";
import { useSite } from "../store";
import { request } from "../api";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  vipExpiresAt: number | null;
  createdAt: string;
  isAdmin: boolean;
}

/** 2099-12-31：用作"永久"的有效期标记。 */
const PERMANENT_AT = Date.parse("2099-12-31T00:00:00.000Z");
const DAY_MS = 24 * 3600 * 1000;

function vipLabel(u: AdminUser): { text: string; active: boolean } {
  if (u.isAdmin) return { text: "管理员", active: true };
  const exp = u.vipExpiresAt;
  if (exp == null) return { text: "未开通", active: false };
  if (exp >= PERMANENT_AT) return { text: "永久有效", active: true };
  const d = new Date(exp).toLocaleDateString("zh-CN");
  return exp > Date.now()
    ? { text: `有效至 ${d}`, active: true }
    : { text: `已过期（${d}）`, active: false };
}

export function UsersDialog({ onClose }: { onClose: () => void }) {
  const { notify } = useSite();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await request<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(data.users);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setVip = async (u: AdminUser, expiresAt: string | null, label: string) => {
    setBusyId(u.id);
    try {
      await request(`/api/admin/users/${u.id}/vip`, {
        method: "POST",
        body: JSON.stringify({ expiresAt }),
      });
      notify(`已${label}：${u.email}`);
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    const ok = window.confirm(
      `删除用户 ${u.email} 吗？\n将删除该用户及其相关记录（学习进度、登录日志、社区动态等）。\n注意：有已支付/待确认订单的用户不可删除。`,
    );
    if (!ok) return;
    setBusyId(u.id);
    try {
      await request(`/api/admin/users/${u.id}`, { method: "DELETE" });
      notify(`已删除用户：${u.email}`);
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      title="用户管理"
      eyebrow="MEMBERS"
      wide
      className="users-dialog"
      busy={busyId !== null}
      onClose={onClose}
    >
      <p className="theme-intro">
        注册用户默认只能看免费内容。在这里开通 VIP 并设置有效期，用户登录后即可听课。
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!users && !error && <p className="theme-intro">正在载入用户…</p>}
      {users && users.length === 0 && (
        <p className="theme-intro">还没有注册用户。</p>
      )}
      <ul className="users-list">
        {(users ?? []).map((u) => {
          const vip = vipLabel(u);
          const busy = busyId === u.id;
          return (
            <li key={u.id} className="users-row">
              <div className="users-info">
                <strong>{u.name || u.email}</strong>
                <span>{u.email}</span>
                <span className={`users-vip ${vip.active ? "active" : ""}`}>
                  {vip.active ? <Check size={13} /> : <X size={13} />}
                  {vip.text}
                </span>
              </div>
              {!u.isAdmin && (
                <div className="users-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void setVip(u, new Date(PERMANENT_AT).toISOString(), "设为永久")
                    }
                  >
                    <InfinityIcon size={13} />
                    永久
                  </button>
                  <button
                    type="button"
                    disabled={busy || u.vipExpiresAt == null}
                    onClick={() => void setVip(u, null, "取消 VIP")}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="users-delete"
                    disabled={busy}
                    onClick={() => void deleteUser(u)}
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="theme-dialog-footer">
        <p>开通后用户重新登录（或刷新）即可解锁 VIP 音频；到期自动上锁。</p>
        <button className="button dark" onClick={onClose}>
          完成
        </button>
      </div>
    </Dialog>
  );
}
