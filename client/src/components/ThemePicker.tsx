import { useState } from "react";
import { ArrowUpRight, Check, Palette } from "lucide-react";
import { useSite } from "../store";
import { request } from "../api";
import { Dialog } from "./Common";
import {
  themeCategories,
  themeCategoryOf,
  themeMeta,
} from "../themes-meta";
import type { SiteTheme } from "../../../shared/model";

/**
 * mode="site"（默认）：管理员设置全站默认主题（走原有草稿+保存流程）。
 * mode="personal"：付费会员设置个人主题（直接 POST /api/user/theme，即时生效）。
 */
export function ThemePicker({
  onClose,
  mode = "site",
}: {
  onClose: () => void;
  mode?: "site" | "personal";
}) {
  const { content, setTheme, saving, auth, notify, refreshAuth } = useSite();
  const siteTheme = content?.theme || "fresh";
  const personalTheme = (auth?.theme as SiteTheme | null) || null;
  const selected = mode === "personal" ? personalTheme : siteTheme;
  const [category, setCategory] = useState(() =>
    themeCategoryOf((selected || siteTheme) as SiteTheme),
  );
  const [busy, setBusy] = useState(false);

  const activeCategory =
    themeCategories.find((c) => c.id === category) ?? themeCategories[0];

  const choosePersonal = async (id: SiteTheme | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await request("/api/user/theme", {
        method: "POST",
        body: JSON.stringify({ theme: id }),
      });
      await refreshAuth();
      notify(id ? "已切换为你的专属主题。" : "已恢复跟随网站默认主题。");
    } catch (e) {
      notify((e as Error).message || "切换失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const isSite = mode === "site";
  const title = isSite ? "更换主题" : "我的主题";
  const intro = isSite
    ? "同一个小世界，换一种喜欢的样子。"
    : "会员专享：选一套只属于你的主题，只改变你看到的样子。";

  return (
    <Dialog
      title={title}
      eyebrow="A LITTLE CHANGE OF MOOD"
      wide
      className="theme-dialog"
      onClose={onClose}
    >
      <p className="theme-intro">{intro}</p>
      <div
        className="theme-category-tabs"
        role="tablist"
        aria-label="主题分类"
      >
        {themeCategories.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={category === c.id}
            className={category === c.id ? "active" : ""}
            onClick={() => setCategory(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>
      <p className="theme-category-subtitle">{activeCategory.subtitle}</p>
      <div className="theme-options" aria-label={activeCategory.title}>
        {!isSite && (
          <button
            className="theme-option theme-option-follow"
            aria-label="跟随网站默认主题"
            aria-pressed={selected === null}
            disabled={busy}
            onClick={() => void choosePersonal(null)}
          >
            <div className="theme-thumbnail" aria-hidden="true">
              <div className="theme-thumb-header">
                <strong>momo.</strong>
                <span>···</span>
              </div>
              <div className="theme-follow-mark">
                <Palette size={26} />
              </div>
            </div>
            <span className="theme-option-name">
              <Palette size={18} />
              <strong>跟随网站默认</strong>
              {selected === null && <Check size={17} />}
            </span>
            <span className="theme-option-subtitle">
              当前全站主题：{themeMeta[siteTheme as SiteTheme].title}
            </span>
            <span className="theme-option-detail">与访客看到的一致</span>
          </button>
        )}
        {activeCategory.themes.map((id) => {
          const { title, subtitle, detail, icon: Icon } = themeMeta[id];
          const isSelected = selected === id;
          return (
            <button
              key={id}
              className="theme-option"
              data-theme-option={id}
              aria-label={`选择${title}主题`}
              aria-pressed={isSelected}
              disabled={saving || busy || !auth?.authenticated}
              onClick={() =>
                isSite ? setTheme(id) : void choosePersonal(id)
              }
            >
              <div className="theme-thumbnail" aria-hidden="true">
                <div className="theme-thumb-header">
                  <strong>momo.</strong>
                  <span>···</span>
                </div>
                <div className="theme-thumb-grid">
                  <div className="theme-thumb-hero">
                    <Icon size={24} />
                    <span />
                    <span />
                  </div>
                  <div className="theme-thumb-photo">
                    <i />
                  </div>
                  <div className="theme-thumb-clock">
                    12:08<small>A LITTLE MOMENT</small>
                  </div>
                  <div className="theme-thumb-notes">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="theme-thumb-calendar">
                    S M T W T F S<small>· · · · · · ·</small>
                  </div>
                  <div className="theme-thumb-music">
                    ♫<span />
                  </div>
                </div>
                <span className="theme-thumb-star">✦</span>
              </div>
              <span className="theme-option-name">
                <Icon size={18} />
                <strong>{title}</strong>
                {isSelected && <Check size={17} />}
              </span>
              <span className="theme-option-subtitle">{subtitle}</span>
              <span className="theme-option-detail">{detail}</span>
            </button>
          );
        })}
      </div>
      <div className="theme-dialog-footer">
        <p>
          {isSite
            ? "点击主题即可试穿。返回页面预览后，点击底部「保存修改」，访客也会看到你选中的主题。"
            : "点击立即生效，只改变你自己的浏览效果。"}
        </p>
        <button className="button dark" onClick={onClose}>
          返回页面预览
          <ArrowUpRight size={16} />
        </button>
      </div>
    </Dialog>
  );
}
