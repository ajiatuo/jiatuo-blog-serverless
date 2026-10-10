import { useEffect, useRef } from "react";
import { useSite } from "./store";

/**
 * 移动端手势（仅 touch 设备，pointer: coarse 或窄屏）：
 * 1. 从屏幕左边缘 24px 内开始的右滑 → 返回上一页（history.length > 1 时）
 * 2. 在页面顶部下拉 → 触发站点数据刷新（复用 store.refresh），带 spinner 提示
 *
 * 不干扰：PC 端、编辑模式、弹窗打开时、输入框内。
 * 全部用 touch 事件 + rAF，被动监听，不阻塞滚动（60fps）。
 */

const EDGE_PX = 24;
const SWIPE_BACK_DX = 80;
const SWIPE_BACK_MAX_DY = 60;
const PULL_DY = 110;
const PULL_MAX_DX = 60;
const MAX_DURATION_MS = 1200;

function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 1100px)").matches
    );
  } catch {
    return false;
  }
}

function gestureBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  // 弹窗打开、可编辑元素、输入控件：不接管手势
  if (document.querySelector("dialog[open]")) return true;
  if (
    target.closest(
      "input, textarea, select, [contenteditable], dialog, .no-gesture",
    )
  )
    return true;
  return false;
}

function scrollerTop(): number {
  const doc = document.scrollingElement;
  const main = document.querySelector("main");
  return Math.max(
    window.scrollY || 0,
    doc ? doc.scrollTop : 0,
    main ? main.scrollTop : 0,
  );
}

export function useAppGestures() {
  const { refresh, editing } = useSite();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  useEffect(() => {
    if (!isCoarsePointer()) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;
    let hintEl: HTMLDivElement | null = null;
    let raf = 0;

    const ensureHint = () => {
      if (hintEl) return hintEl;
      const el = document.createElement("div");
      el.className = "ptr-hint";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = '<span class="ptr-spinner"></span><span>松开刷新</span>';
      document.body.appendChild(el);
      hintEl = el;
      return el;
    };
    const showHint = (dy: number, refreshing: boolean) => {
      const el = ensureHint();
      // rAF 节流，避免 touchmove 高频写 DOM
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.classList.toggle("show", true);
        el.classList.toggle("refreshing", refreshing);
        el.style.transform = `translate(-50%, ${Math.min(dy - 44, 76)}px)`;
      });
    };
    const hideHint = () => {
      cancelAnimationFrame(raf);
      if (hintEl) hintEl.classList.remove("show", "refreshing");
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || editingRef.current) {
        tracking = false;
        return;
      }
      if (gestureBlocked(e.target)) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      // 顶部下拉时给一个跟随手指的小提示（不 preventDefault，不阻断原生滚动）
      if (
        scrollerTop() <= 2 &&
        dy > 56 &&
        Math.abs(dy) > Math.abs(dx) * 1.4
      ) {
        showHint(dy, false);
      } else {
        hideHint();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const wasTracking = tracking;
      tracking = false;
      hideHint();
      if (!wasTracking || editingRef.current) return;
      if (e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      if (dt > MAX_DURATION_MS) return;

      // 1) 左边缘右滑 → 返回上一页
      if (
        startX <= EDGE_PX &&
        dx >= SWIPE_BACK_DX &&
        Math.abs(dy) <= SWIPE_BACK_MAX_DY &&
        window.history.length > 1
      ) {
        window.history.back();
        return;
      }
      // 2) 顶部下拉 → 刷新站点数据
      if (
        scrollerTop() <= 2 &&
        dy >= PULL_DY &&
        Math.abs(dx) <= PULL_MAX_DX
      ) {
        showHint(PULL_DY + 44, true);
        void refreshRef
          .current()
          .catch(() => {})
          .finally(() => hideHint());
        // 兜底：3 秒后一定收起提示
        window.setTimeout(hideHint, 3000);
      }
    };

    const onTouchCancel = () => {
      tracking = false;
      hideHint();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, {
      passive: true,
    });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      cancelAnimationFrame(raf);
      hintEl?.remove();
      hintEl = null;
    };
  }, []);
}
