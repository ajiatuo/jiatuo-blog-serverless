import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Sun,
  Cloud,
  CloudRain,
  Check,
  Lock,
  Unlock,
} from "lucide-react";
import { useSite } from "../store";
import {
  mediaUrl,
  zonedDay,
  weatherLocationKey,
  type Weather,
} from "../../../shared/model";
import { request } from "../api";
import { themeCatAsset } from "../theme";
import {
  Cat,
  Dialog,
  Editable,
  EditButton,
  SafeImage,
  ArrowLink,
  Empty,
  CardBg,
} from "./Common";
import type { EditorSection } from "./Editor";
export type Panel =
  | "projects"
  | "articles"
  | "photos"
  | "collections"
  | "friends"
  | "about"
  | "contact"
  | "sources";
export interface CardActions {
  open: (panel: Panel, id?: string) => void;
  edit: (section: EditorSection) => void;
}
export function Hero({ open, edit }: CardActions) {
  const { editing, content } = useSite();
  const avatarId = content?.profile.avatarId;
  return (
    <section className={`card hero-card ${avatarId ? "has-avatar" : ""}`}>
      <CardBg id="hero" veil />
      <div className="hero-top">
        <Editable field="eyebrow" as="span" className="eyebrow" />
        <EditButton label="编辑个人资料" onClick={() => edit("profile")} />
      </div>
      <Editable as="h1" field="headline" />
      <div className="hero-copy">
        <Editable field="introduction" />
        <Editable field="description" />
      </div>
      <button className="button dark hero-button" onClick={() => open("about")}>
        认识我
        <ArrowUpRight size={16} />
      </button>
      <div className={`hero-celestial ${avatarId ? "has-avatar" : ""}`}>
        {avatarId && (
          <button
            className="hero-avatar"
            aria-label={editing ? "编辑个人头像" : "查看个人介绍"}
            onClick={() => (editing ? edit("profile") : open("about"))}
          >
            <SafeImage
              src={mediaUrl(avatarId, true)}
              alt={`${content?.profile.name} 的个人头像`}
              loading="eager"
            />
          </button>
        )}
        <div className="hero-orbit" aria-hidden="true">
          <span />
          <img
            src={themeCatAsset(content?.theme)}
            alt=""
            className="hero-orbit-logo"
          />
        </div>
      </div>
      <span className="hero-side-note" aria-hidden="true">
        {avatarId ? (
          "A Brighter Daily Life"
        ) : (
          <>
            A<br />
            Brighter
            <br />
            Daily
            <br />
            Life
          </>
        )}
      </span>
      <span className="hero-bottom-note">A PERSONAL SPACE / 2026</span>
      {editing && <span className="editing-hint">点击文字直接编辑</span>}
    </section>
  );
}
export function PhotoCard({ open, edit }: CardActions) {
  const { content } = useSite();
  const photos = content!.photos;
  const [randomPhotoId, setRandomPhotoId] = useState(
    () => photos[Math.floor(Math.random() * photos.length)]?.id || "",
  );
  useEffect(() => {
    if (!photos.some((photo) => photo.id === randomPhotoId))
      setRandomPhotoId(
        photos[Math.floor(Math.random() * photos.length)]?.id || "",
      );
  }, [photos, randomPhotoId]);
  const photo = photos.find((p) => p.id === randomPhotoId) || photos[0];
  return (
    <section className="card photo-card">
      <button
        className="photo-open"
        aria-label="打开相册"
        onClick={() => open("photos", photo?.id)}
      >
        <SafeImage
          src={mediaUrl(photo?.mediaId)}
          alt={photo?.title || "日常照片"}
          loading="eager"
          fetchPriority="high"
        />
      </button>
      <span className="photo-label">日常切片</span>
      <div className="photo-edit">
        <EditButton onClick={() => edit("photos")} label="编辑相册" />
      </div>
      <div className="photo-caption">
        <div>
          <h2>{photo?.title || "下一张喜欢的照片"}</h2>
          <span>{photo?.location || "A LITTLE MOMENT"}</span>
        </div>
        <button
          aria-label="浏览这张照片"
          onClick={() => open("photos", photo?.id)}
        >
          <ArrowUpRight size={23} />
        </button>
      </div>
    </section>
  );
}
export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function ClockCard({
  now,
  edit,
}: {
  now: Date;
  edit: CardActions["edit"];
}) {
  const { content, home } = useSite();
  const { name, latitude, longitude, timeZone } = content!.location;
  const key = weatherLocationKey(content!.location);
  const preview = key !== weatherLocationKey(home!.content.location);
  const [weatherResult, setWeather] = useState<{
    key: string;
    value: Weather;
  } | null>(null);
  const weather = weatherResult?.key === key ? weatherResult.value : null;
  useEffect(() => {
    let active = true;
    const load = () =>
      request<Weather>(
        preview ? "/api/weather/preview" : "/api/weather",
        preview
          ? {
              method: "POST",
              body: JSON.stringify({ latitude, longitude, timeZone }),
            }
          : {},
      )
        .then((w) => {
          if (active) setWeather({ key, value: w });
        })
        .catch(() => {
          if (active) setWeather({ key, value: { available: false } });
        });
    void load();
    const timer = setInterval(() => void load(), 15 * 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, preview]);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":");
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    weekday: "short",
  }).format(now);
  const zone = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")
    ?.value.replace("GMT", "UTC");
  const code = weather?.code || 0,
    Icon = code <= 1 ? Sun : code <= 48 ? Cloud : CloudRain;
  const label =
    code === 0
      ? "晴"
      : code <= 3
        ? "多云"
        : code <= 48
          ? "雾"
          : code >= 71 && code <= 77
            ? "雪"
            : "雨";
  return (
    <section className="card clock-card" aria-label={`${name}当地时间`}>
      <CardBg id="clock" veil />
      <div className="clock-top">
        <span className="eyebrow" title={`LOCAL TIME / ${name.toUpperCase()}`}>
          LOCAL TIME / {name.toUpperCase()}
        </span>
        <span
          className="weather"
          title={
            weather?.updatedAt
              ? `天气更新于 ${new Date(weather.updatedAt).toLocaleTimeString("zh-CN", { timeZone })}`
              : undefined
          }
        >
          {weather?.available ? (
            <>
              <Icon size={23} />
              {Math.round(weather.temperature!)}° {label}
              {weather.stale && <small>上次记录</small>}
            </>
          ) : (
            <small>{weather ? "天气暂不可用" : "天气加载中"}</small>
          )}
        </span>
      </div>
      <div className="clock-digits">
        {parts[0]}
        <span>:</span>
        {parts[1]}
      </div>
      <div className="clock-date">
        {zonedDay(now, timeZone).replaceAll("-", ".")}
        <span>·</span>
        {weekday}
      </div>
      <div className="clock-bottom">
        <i />
        <span title={timeZone}>
          {zone?.replace("GMT", "UTC") === offset
            ? offset
            : `${zone} · ${offset}`}
        </span>
        <EditButton label="编辑地点与时区" onClick={() => edit("location")} />
      </div>
    </section>
  );
}
// 6 号卡：资源分享站（原项目卡已替换，旧 projects 数据仅保留兼容）
// 网盘链接与提取码仅 VIP（或管理员）可见；访客点“付费查看”弹出 VIP 密码框
export function ResourceCard({ edit }: CardActions) {
  const { content, vip, auth, unlockVip, notify } = useSite();
  const resources = content?.resources || [];
  const canView = !!vip?.unlocked || !!auth?.isAdmin;
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!pw.trim() || busy) return;
    setBusy(true);
    try {
      await unlockVip(pw.trim());
      setPw("");
      setPwOpen(false);
    } catch (e) {
      notify((e as Error).message || "解锁失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card project-card">
      <CardBg id="project" veil />
      <div className="section-top">
        <span className="eyebrow">02 / RESOURCES</span>
        <div>
          <EditButton onClick={() => edit("resources")} label="编辑资源分享站" />
        </div>
      </div>
      <div className="home-articles">
        {resources.slice(0, 3).map((r) => (
          <div className="home-article text-only" key={r.id}>
            <span>
              {r.title.trim() && <strong>{r.title}</strong>}
              {r.desc && <span className="article-excerpt">{r.desc}</span>}
              {canView && r.extractCode && (
                <span className="article-excerpt">提取码：{r.extractCode}</span>
              )}
            </span>
            {canView ? (
              r.url ? (
                <a
                  className="text-button"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`获取资源：${r.title}`}
                >
                  获取链接
                  <ArrowUpRight size={15} />
                </a>
              ) : null
            ) : (
              <button
                type="button"
                className="button dark resource-unlock"
                onClick={() => setPwOpen(true)}
              >
                <Lock size={14} />
                付费查看
              </button>
            )}
          </div>
        ))}
        {!resources.length && <Empty>资源正在整理中，敬请期待。</Empty>}
      </div>
      {pwOpen && (
        <Dialog
          title="VIP 解锁"
          eyebrow="资源分享站"
          onClose={() => setPwOpen(false)}
        >
          <p>输入 VIP 密码，即可查看全部资源的下载链接与提取码。</p>
          <div className="course-vip-unlock">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="输入 VIP 密码"
              aria-label="VIP 密码"
            />
            <button
              type="button"
              className="course-btn course-btn-small"
              onClick={() => void submit()}
              disabled={busy || !pw.trim()}
            >
              <Unlock size={14} /> {busy ? "验证中…" : "解锁"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
// 5 号卡：线下共修公告（原文章卡已替换，旧 articles 数据仅保留兼容）
export function EventCard({ edit }: CardActions) {
  const { content } = useSite();
  const events = content?.events || [];
  return (
    <section className="card article-card">
      <CardBg id="articles" veil />
      <div className="section-top">
        <h2>线下共修</h2>
        <div>
          <EditButton onClick={() => edit("events")} label="编辑线下共修" />
        </div>
      </div>
      <div className="home-articles">
        {events.slice(0, 3).map((e) => (
          <div
            className={`home-article text-only${e.title.trim() ? "" : " untitled"}`}
            key={e.id}
          >
            <span>
              {e.title.trim() && <strong>{e.title}</strong>}
              {(e.date || e.location) && (
                <span className="article-excerpt">
                  {[e.date, e.location].filter(Boolean).join(" · ")}
                </span>
              )}
              {e.spots && <span className="article-excerpt">{e.spots}</span>}
            </span>
          </div>
        ))}
        {!events.length && (
          <Empty>近期线下共修筹备中，敬请期待。</Empty>
        )}
      </div>
    </section>
  );
}
const monthNames = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];
export function CalendarCard({ now }: { now: Date }) {
  const { content } = useSite();
  const timeZone = content!.location.timeZone;
  const [year, month, today] = zonedDay(now, timeZone).split("-").map(Number);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [timeZone]);
  const cursor = new Date(Date.UTC(year, month - 1 + offset, 1)),
    y = cursor.getUTCFullYear(),
    m = cursor.getUTCMonth(),
    blanks = (cursor.getUTCDay() + 6) % 7;
  const days = [
    ...Array(blanks).fill(null),
    ...Array.from(
      { length: new Date(Date.UTC(y, m + 1, 0)).getUTCDate() },
      (_, i) => i + 1,
    ),
  ];
  return (
    <section className="card calendar-card">
      <div className="calendar-top">
        <div>
          <h2>{monthNames[m]}</h2>
          <span className="eyebrow">
            {cursor
              .toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
              .toUpperCase()}
          </span>
        </div>
        <div className="month-controls">
          <button aria-label="上个月" onClick={() => setOffset(offset - 1)}>
            <ChevronLeft size={17} />
          </button>
          <span>{y}</span>
          <button aria-label="下个月" onClick={() => setOffset(offset + 1)}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <span key={d} className="weekday">
            {d}
          </span>
        ))}
        {days.map((d, i) => (
          <span
            key={i}
            className={offset === 0 && d === today ? "today" : ""}
            aria-current={offset === 0 && d === today ? "date" : undefined}
          >
            {d}
          </span>
        ))}
      </div>
      <button className="calendar-footer" onClick={() => setOffset(0)}>
        <i />
        {offset ? "回到今天" : "今天也适合开始。"}
      </button>
    </section>
  );
}
const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(".0", "")}k` : String(n);
const MOONS = [
  { name: "磁性之月", question: "我的目的是什么？", tip: "定个小目标，别定那种完不成的。" },
  { name: "月亮之月", question: "我的挑战是什么？", tip: "困难是用来跨的，不是用来emo的。" },
  { name: "电力之月", question: "我如何给予最好的服务？", tip: "帮人一把，自己也开心。" },
  { name: "自我存在之月", question: "我采取什么形式？", tip: "做自己，别演。" },
  { name: "超频之月", question: "我如何给予力量？", tip: "给人加油，自己也充电。" },
  { name: "韵律之月", question: "我如何扩展平等？", tip: "对谁都一样好，别双标。" },
  { name: "共振之月", question: "我如何调和？", tip: "跟世界和解，先跟自己和解。" },
  { name: "银河之月", question: "我是否活出我的信念？", tip: "说到做到，别光说不练。" },
  { name: "太阳之月", question: "我如何实现目的？", tip: "想好了就干，别犹豫。" },
  { name: "行星之月", question: "我如何完善？", tip: "每天进步一点点就行。" },
  { name: "光谱之月", question: "我如何释放？", tip: "放下包袱，轻装上阵。" },
  { name: "水晶之月", question: "我如何合作？", tip: "一个人走得快，一群人走得远。" },
  { name: "宇宙之月", question: "我如何超越？", tip: "突破舒适圈，试试新的。" },
];
function getMoonDate(date: Date) {
  const y = date.getFullYear();
  // 十三月亮历新年在 7 月 26 日
  let newYear = new Date(y, 6, 26);
  if (date < newYear) newYear = new Date(y - 1, 6, 26);
  // 无时间日：7 月 25 日
  const dot = new Date(newYear.getFullYear() + 1, 6, 25);
  if (date.getMonth() === 6 && date.getDate() === 25) {
    return { isDot: true, moon: -1, day: 0 };
  }
  const days = Math.floor((date.getTime() - newYear.getTime()) / 86400000);
  const moon = Math.floor(days / 28);
  const day = (days % 28) + 1;
  return { isDot: false, moon, day };
}
export function CheckinCard() {
  const { stats, checkin, notify, home, content } = useSite();
  const timeZoneChanged =
    home?.content.location.timeZone !== content?.location.timeZone;
  const [pending, setPending] = useState(false);
  const moonDate = getMoonDate(new Date());
  const moonInfo = moonDate.isDot ? null : MOONS[moonDate.moon];
  return (
    <section className="card checkin-card">
      <CardBg id="checkin" veil />
      <span className="eyebrow">玛雅调频</span>
      <div className="checkin-main">
        <div>
          <h2>{moonDate.isDot ? "无时间日" : `${moonInfo?.name} · 第 ${moonDate.day} 天`}</h2>
          <div className="checkin-greeting">
            <Cat />
            <span>
              {moonDate.isDot
                ? "今天不属于任何月份，好好休息。"
                : `${moonInfo?.question}${moonInfo?.tip}`}
              {stats?.checkedIn && ` 已累计修习 ${stats.checkins} 天。`}
            </span>
          </div>
        </div>
        <button
          className="button lime"
          disabled={pending || !stats || stats.checkedIn || timeZoneChanged}
          onClick={async () => {
            setPending(true);
            try {
              await checkin();
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          {timeZoneChanged
            ? "保存后签到"
            : pending
              ? "签到中…"
              : stats?.checkedIn
                ? "正念完成"
                : "完成今日调频"}
          {stats?.checkedIn ? <Check size={15} /> : <ArrowUpRight size={15} />}
        </button>
      </div>
      <div className="stats-row">
        <div>
          <strong>{stats ? compact(stats.todayVisitors) : "—"}</strong>
          <span>今日访客</span>
        </div>
        <div>
          <strong>{stats ? compact(stats.totalViews) : "—"}</strong>
          <span>累计访问</span>
        </div>
        <div>
          <strong>{stats ? stats.daysOnline : "—"}</strong>
          <span>运行天数</span>
        </div>
      </div>
    </section>
  );
}
export function CommunityCard({
  onOpen,
  onLogin,
}: {
  onOpen: () => void;
  onLogin: () => void;
}) {
  const { auth } = useSite();
  const loggedIn = !!auth?.authenticated;
  // 精选分享预览（最新 2 条，公开接口，未登录也能看）
  const [preview, setPreview] = useState<{ id: string; content: string; author: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    request<{
      memos: { id: string; content: string; author: { name: string } }[];
    }>("/api/memos?limit=3")
      .then((d) => {
        if (cancelled) return;
        setPreview(
          (d.memos ?? []).slice(0, 2).map((m) => ({
            id: m.id,
            content: m.content,
            author: m.author.name,
          })),
        );
      })
      .catch(() => {
        /* 预览加载失败不影响卡片 */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section
      className="card community-card community-card-rich"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      aria-label="进入会员社区"
    >
      <CardBg id="community" className="community-card-bg" />
      <div className="community-card-content">
        <span className="eyebrow">COMMUNITY</span>
        <h2>会员社区</h2>
        <p>分享修习感悟，与同行者互相照亮。免费注册即可加入讨论。</p>
        {preview.length > 0 && (
          <ul className="community-card-preview">
            {preview.map((p) => (
              <li key={p.id}>
                <q>
                  {p.content.length > 40 ? `${p.content.slice(0, 40)}…` : p.content}
                </q>
                <span>—— {p.author}</span>
              </li>
            ))}
          </ul>
        )}
        <div
          className="community-card-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {loggedIn ? (
            <button className="community-card-cta" onClick={onOpen}>
              进入社区 <ArrowUpRight size={16} />
            </button>
          ) : (
            <>
              <button className="community-card-cta primary" onClick={onLogin}>
                免费注册加入 <ArrowUpRight size={16} />
              </button>
              <button className="community-card-ghost" onClick={onOpen}>
                先看看
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
export function CollectionCard({ open, edit }: CardActions) {
  const { content } = useSite();
  const items = content?.collections.slice(0, 2) || [];
  return (
    <section className="card collection-card">
      <CardBg id="collections" veil />
      <div className="section-top">
        <h2>最近收集</h2>
        <div>
          <EditButton onClick={() => edit("collections")} label="编辑收集" />
          <ArrowLink onClick={() => open("collections")} />
        </div>
      </div>
      <div className="collection-previews">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => open("collections", c.id)}
            aria-label={`查看${c.title}`}
          >
            <SafeImage src={mediaUrl(c.imageId, true)} alt={c.title} />
          </button>
        ))}
        {!items.length && <Empty>留一份喜欢的灵感。</Empty>}
      </div>
      <strong className="collection-caption">一些值得留下的灵感。</strong>
      <div className="collection-filter">
        <i />
        {["图片", "网站", "灵感"].map((k) => (
          <button key={k} onClick={() => open("collections", k)}>
            {k}
          </button>
        ))}
      </div>
    </section>
  );
}
