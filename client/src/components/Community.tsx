import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Trash2, ChevronDown, ShieldCheck, X, Check } from "lucide-react";
import { Dialog, PageAdminButton } from "./Common";
import { MemoSkeletonList } from "./Skeleton";
import { useSite } from "../store";
import { request } from "../api";

const EMOJIS = ["👍", "❤️", "🙏", "😄", "😮", "🎉"];

export interface CommunityReaction {
  emoji: string;
  count: number;
  reacted: boolean;
}
export interface CommunityAuthor {
  id: string;
  name: string;
}
export interface CommunityMemo {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  author: CommunityAuthor;
  replyCount: number;
  reactions: CommunityReaction[];
}
export interface CommunityReply {
  id: string;
  content: string;
  createdAt: string;
  author: CommunityAuthor;
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Avatar({ name }: { name: string }) {
  const ch = (name || "?").trim().slice(0, 1);
  return <span className="community-avatar" aria-hidden="true">{ch}</span>;
}

function MemoCard({
  memo,
  myId,
  onLogin,
  onDeleted,
  onChanged,
}: {
  memo: CommunityMemo;
  myId: string | null;
  onLogin: () => void;
  onDeleted: (id: string) => void;
  onChanged: () => void;
}) {
  const { auth, notify } = useSite();
  const [replies, setReplies] = useState<CommunityReply[] | null>(null);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [reactBusy, setReactBusy] = useState(false);
  const loggedIn = !!auth?.authenticated;
  const canDeleteMemo = !!auth?.isAdmin || (!!myId && memo.author.id === myId);
  const canDeleteReply = (authorId: string) => !!auth?.isAdmin || (!!myId && authorId === myId);

  const loadReplies = useCallback(async () => {
    try {
      const data = await request<{ replies: CommunityReply[] }>(`/api/memos/${memo.id}/replies`);
      setReplies(data.replies);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [memo.id, notify]);

  const toggleReplies = () => {
    if (!showReplies && replies === null) void loadReplies();
    setShowReplies((v) => !v);
  };

  const react = async (emoji: string) => {
    if (!loggedIn) return onLogin();
    if (reactBusy) return;
    setReactBusy(true);
    try {
      await request(`/api/memos/${memo.id}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReactBusy(false);
    }
  };

  const sendReply = async () => {
    if (!loggedIn) return onLogin();
    const text = replyText.trim();
    if (!text || replying) return;
    setReplying(true);
    try {
      await request(`/api/memos/${memo.id}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
      setReplyText("");
      await loadReplies();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReplying(false);
    }
  };

  const del = async () => {
    if (!window.confirm("确定删除这条动态吗？")) return;
    try {
      await request(`/api/memos/${memo.id}`, { method: "DELETE" });
      onDeleted(memo.id);
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const delReply = async (replyId: string) => {
    if (!window.confirm("确定删除这条回复吗？")) return;
    try {
      await request(`/api/memos/replies/${replyId}`, { method: "DELETE" });
      await loadReplies();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <article className="community-memo">
      <div className="community-memo-head">
        <Avatar name={memo.author.name} />
        <div className="community-memo-meta">
          <strong>{memo.author.name}</strong>
          <span>{timeAgo(memo.createdAt)}</span>
        </div>
        {(canDeleteMemo) && (
          <button className="community-icon-btn" aria-label="删除动态" onClick={del}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <p className="community-memo-body">{memo.content}</p>
      <div className="community-memo-actions">
        <div className="community-reactions">
          {EMOJIS.map((emoji) => {
            const r = memo.reactions.find((x) => x.emoji === emoji);
            const count = r?.count ?? 0;
            const reacted = !!r?.reacted;
            return (
              <button
                key={emoji}
                className={`community-emoji${reacted ? " reacted" : ""}`}
                onClick={() => void react(emoji)}
                aria-label={`表情 ${emoji}`}
              >
                <span>{emoji}</span>
                {count > 0 && <i>{count}</i>}
              </button>
            );
          })}
        </div>
        <button className="community-reply-toggle" onClick={toggleReplies}>
          <MessageCircle size={15} />
          <span>{memo.replyCount > 0 ? memo.replyCount : "回复"}</span>
          <ChevronDown size={14} className={showReplies ? "open" : ""} />
        </button>
      </div>
      {showReplies && (
        <div className="community-replies">
          {(replies ?? []).map((r) => (
            <div key={r.id} className="community-reply">
              <Avatar name={r.author.name} />
              <div className="community-reply-body">
                <div className="community-reply-head">
                  <strong>{r.author.name}</strong>
                  <span>{timeAgo(r.createdAt)}</span>
                  {canDeleteReply(r.author.id) && (
                    <button className="community-icon-btn small" aria-label="删除回复" onClick={() => void delReply(r.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p>{r.content}</p>
              </div>
            </div>
          ))}
          {replies !== null && replies.length === 0 && (
            <p className="community-empty">还没有回复，来抢沙发吧。</p>
          )}
          <div className="community-reply-box">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={loggedIn ? "写下你的回复…" : "登录后参与回复"}
              maxLength={500}
              onFocus={() => { if (!loggedIn) onLogin(); }}
              onKeyDown={(e) => { if (e.key === "Enter") void sendReply(); }}
            />
            <button className="button dark small" disabled={replying || !replyText.trim()} onClick={() => void sendReply()}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function CommunityPage({ onLogin, onReview }: { onLogin: () => void; onReview?: () => void }) {
  const { auth, notify } = useSite();
  const [memos, setMemos] = useState<CommunityMemo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [me, setMe] = useState<{ id: string; requireReview: boolean } | null>(null);
  const loggedIn = !!auth?.authenticated;
  const loadingRef = useRef(false);

  const load = useCallback(async (nextCursor: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (nextCursor) setLoadingMore(true);
    try {
      const q = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}&limit=20` : "?limit=20";
      const data = await request<{ memos: CommunityMemo[]; nextCursor: string | null }>(`/api/memos${q}`);
      setMemos((prev) => (nextCursor ? [...prev, ...data.memos] : data.memos));
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor && data.memos.length > 0);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [notify]);

  const refresh = useCallback(() => {
    setCursor(null);
    setHasMore(true);
    void load(null);
  }, [load]);

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    if (!loggedIn) { setMe(null); return; }
    request<{ id: string; requireReview: boolean }>("/api/user/me")
      .then((d) => setMe({ id: d.id, requireReview: d.requireReview }))
      .catch(() => setMe(null));
  }, [loggedIn]);

  // 轻量刷新单条动态的互动数据（表情/回复数变化时）
  const refreshOne = useCallback(async (id: string) => {
    try {
      const data = await request<{ memos: CommunityMemo[]; nextCursor: string | null }>("/api/memos?limit=50");
      const found = data.memos.find((m) => m.id === id);
      if (found) setMemos((prev) => prev.map((m) => (m.id === id ? found : m)));
    } catch { /* 忽略，后台刷新失败不打扰 */ }
  }, []);

  const post = async () => {
    if (!loggedIn) return onLogin();
    const content = text.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      const data = await request<{ id: string; pending: boolean }>("/api/memos", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setText("");
      if (data.pending) {
        notify("已提交审核，通过后会显示在时间线。");
      } else {
        notify("发布成功。");
        refresh();
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="community-page">
      <div className="community-hero">
        <div className="community-hero-head">
          <div>
            <span className="eyebrow">会员社区</span>
            <h1>在这里，彼此照亮</h1>
          </div>
          {onReview && <PageAdminButton label="社区审核" icon={<ShieldCheck size={13} />} onClick={onReview} />}
        </div>
        <p>分享你的修习感悟、生活点滴，与同行者互相回应、彼此鼓励。</p>
        {!loggedIn && (
          <div className="community-guide">
            <ShieldCheck size={18} />
            <div>
              <strong>成为会员，你可以：</strong>
              <ul>
                <li>发布动态，记录修习与生活</li>
                <li>回复他人，参与交流讨论</li>
                <li>用表情回应，传递善意</li>
                <li>受邀参与正念共修与线下活动</li>
              </ul>
              <button className="button lime" onClick={onLogin}>注册 / 登录成为会员</button>
            </div>
          </div>
        )}
      </div>

      {loggedIn && (
        <div className="community-composer">
          <Avatar name={auth?.email?.split("@")[0] || "我"} />
          <div className="community-composer-body">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="分享此刻的心情或感悟…"
              rows={3}
              maxLength={1000}
            />
            <div className="community-composer-foot">
              <span>{text.trim().length}/1000{me?.requireReview ? " · 你的动态需要审核后显示" : ""}</span>
              <button className="button dark" disabled={posting || !text.trim()} onClick={() => void post()}>
                {posting ? "发布中…" : "发布"}
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="community-list">
        {loading && <MemoSkeletonList count={3} />}
        {!loading && memos.length === 0 && (
          <p className="community-empty">还没有人分享，来发第一条动态吧。</p>
        )}
        {memos.map((m) => (
          <MemoCard
            key={m.id}
            memo={m}
            myId={me?.id ?? null}
            onLogin={onLogin}
            onDeleted={(id) => setMemos((prev) => prev.filter((x) => x.id !== id))}
            onChanged={() => void refreshOne(m.id)}
          />
        ))}
      </div>
      {hasMore && !loading && (
        <button className="button community-more" disabled={loadingMore} onClick={() => void load(cursor)}>
          {loadingMore ? "载入中…" : "加载更多"}
        </button>
      )}
    </div>
  );
}

interface ReviewUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  requireReview: boolean;
}

/** 管理员：社区审核（待审动态 + 按人审核开关） */
export function CommunityReviewDialog({ onClose }: { onClose: () => void }) {
  const { notify } = useSite();
  const [pending, setPending] = useState<CommunityMemo[] | null>(null);
  const [users, setUsers] = useState<ReviewUser[] | null>(null);
  const [tab, setTab] = useState<"pending" | "users">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([
        request<{ memos: CommunityMemo[] }>("/api/memos/pending"),
        request<{ users: ReviewUser[] }>("/api/admin/users"),
      ]);
      setPending(p.memos);
      setUsers(u.users);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const review = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      await request(`/api/memos/${id}/${action}`, { method: "POST" });
      notify(action === "approve" ? "已通过。" : "已驳回。");
      setPending((prev) => (prev ?? []).filter((m) => m.id !== id));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleReview = async (u: ReviewUser) => {
    setBusy(u.id);
    try {
      await request(`/api/admin/users/${u.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ require_review: u.requireReview ? 0 : 1 }),
      });
      notify(`${u.name} 已设为${u.requireReview ? "直接显示" : "需要审核"}。`);
      setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, requireReview: !x.requireReview } : x)));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog title="社区审核" onClose={onClose} wide>
      <div className="community-tabs">
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          待审核{(pending?.length ?? 0) > 0 ? `（${pending!.length}）` : ""}
        </button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>会员审核开关</button>
      </div>
      {tab === "pending" && (
        <div className="community-review-list">
          {pending === null && <p className="community-empty">载入中…</p>}
          {pending !== null && pending.length === 0 && <p className="community-empty">没有待审核的动态。</p>}
          {(pending ?? []).map((m) => (
            <div key={m.id} className="community-review-item">
              <div className="community-review-head">
                <Avatar name={m.author.name} />
                <div className="community-memo-meta">
                  <strong>{m.author.name}</strong>
                  <span>{timeAgo(m.createdAt)}</span>
                </div>
              </div>
              <p>{m.content}</p>
              <div className="community-review-actions">
                <button className="button lime small" disabled={busy === m.id} onClick={() => void review(m.id, "approve")}>
                  <Check size={14} /> 通过
                </button>
                <button className="button small" disabled={busy === m.id} onClick={() => void review(m.id, "reject")}>
                  <X size={14} /> 驳回
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "users" && (
        <div className="community-review-list">
          <p className="community-hint">打开开关后，该会员发布动态需审核通过才显示；关闭则直接显示。</p>
          {users === null && <p className="community-empty">载入中…</p>}
          {(users ?? []).filter((u) => !u.isAdmin).map((u) => (
            <div key={u.id} className="community-user-row">
              <Avatar name={u.name} />
              <div className="community-memo-meta">
                <strong>{u.name}</strong>
                <span>{u.email}</span>
              </div>
              <button
                className={`community-switch${u.requireReview ? " on" : ""}`}
                disabled={busy === u.id}
                onClick={() => void toggleReview(u)}
                aria-label={`${u.name}审核开关`}
              >
                <i />
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
