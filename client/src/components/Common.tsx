import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, ImageOff, Pencil, ArrowUpRight } from "lucide-react";
import { useSite } from "../store";
import { registerDialog, setDialogBusy } from "../dialogLayers";
import { DARK_THEMES } from "../theme";
import type { HomeContent, CardId } from "../../../shared/model";
import { cardBgSrc } from "../cardBackgrounds";
export function Cat({ className = "" }: { className?: string }) {
  const { content } = useSite();
  const theme = content?.theme ?? "fresh";
  // V5 呼吸动图替换像素猫：深色主题用 dark 版，浅色用 light 版
  const src = DARK_THEMES.includes(theme)
    ? "/assets/breath-web-dark.gif"
    : "/assets/breath-web-light.gif";
  return (
    <img
      src={src}
      alt="My Blog"
      className={`cat ${className}`}
    />
  );
}
export function SafeImage({
  src,
  alt,
  className = "",
  onClick,
  loading = "lazy",
  fetchPriority = "auto",
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  /** 首屏图片传 "eager"，其余默认懒加载（原生 loading + 异步解码，零 JS 开销） */
  loading?: "lazy" | "eager";
  /** LCP 图片传 "high"，浏览器优先下载 */
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed || !src ? (
    <div className={`image-fallback ${className}`}>
      <ImageOff size={20} />
      <span>{src ? "图片暂不可用" : "等待新的画面"}</span>
    </div>
  ) : (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => setFailed(true)}
      onClick={onClick}
    />
  );
}
export function Dialog({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  className = "",
  busy = false,
  noLayer = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
  busy?: boolean;
  /** 为 true 时不注册到 dialogLayers，避免从 AdminBar 内打开的对话框导致循环 portal */
  noLayer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const action = previous?.dataset.adminAction;
    const dialog = ref.current!;
    dialog.showModal();
    const restoreFocus = () => {
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
        else if (action)
          document
            .querySelector<HTMLElement>(`[data-admin-action="${action}"]`)
            ?.focus();
      });
    };
    if (noLayer) {
      return () => {
        dialog.close();
        restoreFocus();
      };
    }
    const unregister = registerDialog(dialog);
    return () => {
      unregister();
      dialog.close();
      restoreFocus();
    };
  }, []);
  useEffect(() => {
    if (ref.current) setDialogBusy(ref.current, busy);
  }, [busy]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""} ${className}`}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !items.includes(document.activeElement as HTMLElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !items.includes(document.activeElement as HTMLElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const b = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < b.left ||
          e.clientX > b.right ||
          e.clientY < b.top ||
          e.clientY > b.bottom
        )
          onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="dialog-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button close-button"
          aria-label="关闭面板"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export function EditButton({
  onClick,
  label = "编辑内容",
}: {
  onClick: () => void;
  label?: string;
}) {
  const { editing } = useSite();
  return editing ? (
    <button className="edit-trigger" onClick={onClick} aria-label={label}>
      <Pencil size={13} />
      <span>编辑</span>
    </button>
  ) : null;
}
export function PageAdminButton({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon?: ReactNode;
}) {
  const { auth } = useSite();
  if (!auth?.isAdmin) return null;
  return (
    <button className="page-edit-btn" onClick={onClick} aria-label={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
export function PageEditButton({
  onEdit,
  label = "编辑",
}: {
  onEdit: () => void;
  label?: string;
}) {
  const { beginEdit } = useSite();
  return (
    <PageAdminButton
      label={label}
      icon={<Pencil size={13} />}
      onClick={() => {
        beginEdit();
        onEdit();
      }}
    />
  );
}
export function Editable({
  field,
  as: Tag = "p",
  className = "",
}: {
  field: keyof HomeContent["profile"];
  as?: "p" | "span" | "h1";
  className?: string;
}) {
  const { editing, content, change } = useSite();
  const value = String(content?.profile[field] || "");
  return editing ? (
    <textarea
      className={`inline-edit ${className}`}
      aria-label={`编辑${({ headline: "首页标题", introduction: "个人介绍", description: "首页描述", eyebrow: "顶部标签", motto: "页脚寄语", name: "名字" } as Record<string, string>)[field] || field}`}
      rows={field === "headline" ? 2 : 1}
      value={value}
      onChange={(e) =>
        change((c) => ({
          ...c,
          profile: { ...c.profile, [field]: e.target.value },
        }))
      }
    />
  ) : (
    <Tag className={className}>
      {field === "headline" ? (
        <>
          <span className="headline-primary">{value.split("\n")[0]}</span>
          {value.includes("\n") && (
            <span className="headline-secondary">
              {value.split("\n").slice(1).join(" ")}
            </span>
          )}
        </>
      ) : (
        value
      )}
    </Tag>
  );
}
export function ArrowLink({
  children,
  onClick,
}: {
  children?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-content">{children}</div>;
}
/**
 * 主页卡片背景层：图片来源统一走 cardBgSrc()（后台可替换），
 * 不要在调用处写死 URL。无背景时渲染 null，不占位。
 * veil=true 时加一层暖白柔光，保证深色文字可读（9 号卡自带深色处理，不用 veil）。
 */
export function CardBg({
  id,
  className = "",
  veil = false,
}: {
  id: CardId;
  className?: string;
  veil?: boolean;
}) {
  const { content } = useSite();
  const src = cardBgSrc(content, id);
  if (!src) return null;
  return (
    <div
      className={"card-bg" + (veil ? " card-bg-veil" : "") + (className ? " " + className : "")}
      aria-hidden="true"
      style={{ backgroundImage: "url(\"" + src + "\")" }}
    />
  );
}
