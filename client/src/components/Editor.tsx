import { useState, type ChangeEvent } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  Image as ImageIcon,
  GripVertical,
  Play,
  Lock,
} from "lucide-react";
import { useSite } from "../store";
import { Dialog, SafeImage } from "./Common";
import { MusicCover } from "./MusicCover";
import { LocationEditor } from "./LocationEditor";
import { request } from "../api";
import {
  articleDateFromLocal,
  articleDateParts,
  articleDateSchema,
  articleExcerpt,
} from "../../../shared/articles";
import {
  mediaUrl,
  type AboutServiceIcon,
  type CardId,
  type HomeContent,
  type Media,
} from "../../../shared/model";
import { CARD_BG_FALLBACK, CARD_BG_LABELS } from "../cardBackgrounds";
export type EditorSection =
  | "location"
  | "profile"
  | "teacher"
  | "about"
  | "course"
  | "series"
  | "projects"
  | "articles"
  | "events"
  | "resources"
  | "photos"
  | "collections"
  | "friends"
  | "tracks"
  | "cardBackgrounds";
type Entry = Record<string, string | boolean | null>;
type ContentSection = Exclude<EditorSection, "location">;
function ArticleDateEditor({
  value,
  timeZone,
  onChange,
}: {
  value: string;
  timeZone: string;
  onChange: (value: string) => void;
}) {
  const { day, time } = articleDateParts(value, timeZone);
  const valid = articleDateSchema.safeParse(value).success;
  const updateDate = (nextDay: string, nextTime: string) => {
    if (!nextTime) return onChange(nextDay);
    const local = `${nextDay}T${nextTime}`;
    // Keep incomplete or skipped local times in the draft so validation blocks
    // saving them instead of silently retaining a different publication time.
    onChange(articleDateFromLocal(local, timeZone, value) || local);
  };
  return (
    <fieldset className="article-date-fields">
      <legend>发布时间</legend>
      <div>
        <label>
          日期
          <input
            type="date"
            value={day}
            onChange={(e) => updateDate(e.target.value, time)}
            aria-invalid={!valid}
          />
        </label>
        <label>
          时间（可选）
          <input
            type="time"
            step="1"
            value={time}
            onChange={(e) => updateDate(day, e.target.value)}
            aria-invalid={!valid}
          />
        </label>
      </div>
      <div className="article-date-note">
        <small>时区：{timeZone}。时间留空时只显示日期。</small>
        <button
          className="text-button"
          onClick={() => onChange(new Date().toISOString())}
        >
          使用当前时间
        </button>
      </div>
      {!valid && (
        <p className="form-error" role="alert">
          请填写有效日期和时间；夏令时跳过的时段不可用。
        </p>
      )}
    </fieldset>
  );
}
const names: Record<ContentSection, string> = {
  profile: "个人资料与联系",
  teacher: "师资介绍",
  about: "关于学苑",
  course: "课程主页",
  series: "课程系列",
  projects: "项目",
  articles: "文章",
  events: "线下共修",
  resources: "资源分享站",
  photos: "相册与首页照片",
  collections: "收集",
  friends: "友链",
  tracks: "曲目",
  cardBackgrounds: "卡片背景",
};
/** 秒 → m:ss（课时列表时长展示用） */
function fmtDuration(sec: unknown): string {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function Editor({
  section,
  onClose,
}: {
  section: EditorSection;
  onClose: () => void;
}) {
  return section === "location" ? (
    <LocationEditor onClose={onClose} />
  ) : (
    <ContentEditor section={section} onClose={onClose} />
  );
}
// 师资资质/经历列表：简单的增删改行内编辑器（数组顺序即展示顺序）
function TeacherCredentials({
  value,
  disabled,
  onChange,
}: {
  value: { id: string; text: string }[];
  disabled: boolean;
  onChange: (next: { id: string; text: string }[]) => void;
}) {
  return (
    <div>
      <span>资质 / 经历</span>
      {value.map((c, i) => (
        <div
          key={c.id}
          style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}
        >
          <input
            aria-label={`资质经历第 ${i + 1} 条`}
            placeholder="例如：10 年正念教学经验"
            value={c.text}
            disabled={disabled}
            style={{ flex: 1 }}
            onChange={(e) =>
              onChange(
                value.map((v) =>
                  v.id === c.id ? { ...v, text: e.target.value } : v,
                ),
              )
            }
          />
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => onChange(value.filter((v) => v.id !== c.id))}
          >
            删除
          </button>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() =>
            onChange([...value, { id: crypto.randomUUID(), text: "" }])
          }
        >
          + 添加一条
        </button>
      </div>
    </div>
  );
}
// 关于学苑服务卡片：标题 + 描述 + 图标下拉，增删改行内编辑器（数组顺序即展示顺序）
const aboutIconOptions = [
  { value: "heart", label: "爱心" },
  { value: "leaf", label: "叶子" },
  { value: "flower", label: "花朵" },
  { value: "users", label: "人群" },
  { value: "moon", label: "月亮" },
];
function AboutServices({
  value,
  disabled,
  onChange,
}: {
  value: { id: string; title: string; desc: string; icon: AboutServiceIcon }[];
  disabled: boolean;
  onChange: (
    next: { id: string; title: string; desc: string; icon: AboutServiceIcon }[],
  ) => void;
}) {
  return (
    <div>
      <span>服务卡片（按填写顺序展示）</span>
      {value.map((s, i) => (
        <div
          key={s.id}
          style={{
            display: "flex",
            gap: 8,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <input
            aria-label={`服务卡片第 ${i + 1} 个标题`}
            placeholder="标题，如：正念冥想课程"
            value={s.title}
            disabled={disabled}
            style={{ flex: "0 0 130px" }}
            onChange={(e) =>
              onChange(
                value.map((v) =>
                  v.id === s.id ? { ...v, title: e.target.value } : v,
                ),
              )
            }
          />
          <input
            aria-label={`服务卡片第 ${i + 1} 个描述`}
            placeholder="一句话描述"
            value={s.desc}
            disabled={disabled}
            style={{ flex: 1 }}
            onChange={(e) =>
              onChange(
                value.map((v) =>
                  v.id === s.id ? { ...v, desc: e.target.value } : v,
                ),
              )
            }
          />
          <select
            aria-label={`服务卡片第 ${i + 1} 个图标`}
            value={s.icon}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                value.map((v) =>
                  v.id === s.id
                    ? { ...v, icon: e.target.value as AboutServiceIcon }
                    : v,
                ),
              )
            }
          >
            {aboutIconOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => onChange(value.filter((v) => v.id !== s.id))}
          >
            删除
          </button>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...value,
              { id: crypto.randomUUID(), title: "", desc: "", icon: "heart" },
            ])
          }
        >
          + 添加服务卡片
        </button>
      </div>
    </div>
  );
}
// 课程学员评价：昵称 + 评价内容，增删改行内编辑器（数组顺序即展示顺序）
function CourseReviews({
  value,
  disabled,
  onChange,
}: {
  value: { id: string; name: string; body: string }[];
  disabled: boolean;
  onChange: (next: { id: string; name: string; body: string }[]) => void;
}) {
  return (
    <div>
      <span>学员评价（按填写顺序展示）</span>
      {value.map((r, i) => (
        <div
          key={r.id}
          style={{
            display: "grid",
            gap: 6,
            marginTop: 8,
            padding: 10,
            border: "1px solid var(--line)",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              aria-label={`学员评价第 ${i + 1} 个昵称`}
              placeholder="学员昵称"
              value={r.name}
              disabled={disabled}
              style={{ flex: "0 0 120px" }}
              onChange={(e) =>
                onChange(
                  value.map((v) =>
                    v.id === r.id ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => onChange(value.filter((v) => v.id !== r.id))}
            >
              删除
            </button>
          </div>
          <textarea
            aria-label={`学员评价第 ${i + 1} 个内容`}
            placeholder="评价内容"
            rows={2}
            value={r.body}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                value.map((v) =>
                  v.id === r.id ? { ...v, body: e.target.value } : v,
                ),
              )
            }
          />
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() =>
            onChange([...value, { id: crypto.randomUUID(), name: "", body: "" }])
          }
        >
          + 添加评价
        </button>
      </div>
    </div>
  );
}
function ContentEditor({
  section,
  onClose,
}: {
  section: ContentSection;
  onClose: () => void;
}) {
  const { content, change, notify } = useSite();
  const [selected, setSelected] = useState<string | null>(
      section === "profile" ||
        section === "teacher" ||
        section === "about" ||
        section === "course" ||
        section === "cardBackgrounds"
        ? null
        : content![section][0]?.id || null,
    ),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  // 拖拽排序状态：dragId=正在拖的条目，dragOverId=当前悬停的目标条目
  const [dragId, setDragId] = useState<string | null>(null),
    [dragOverId, setDragOverId] = useState<string | null>(null);
  // profile / teacher / about / course / cardBackgrounds 为单例内容：无条目列表，直接编辑整个对象
  const isSingle =
    section === "profile" ||
    section === "teacher" ||
    section === "about" ||
    section === "course" ||
    section === "cardBackgrounds";
  const list = isSingle ? [] : content![section];
  const entry = (section === "profile"
    ? { ...content!.profile, ...content!.social }
    : section === "teacher"
      ? { ...content!.teacher }
      : section === "about"
        ? { ...content!.about }
        : section === "course"
          ? { ...content!.course }
          : section === "cardBackgrounds"
            ? { ...content!.cardBackgrounds }
            : list.find((i) => i.id === selected)) as unknown as
    | Entry
    | undefined;
  const update = (key: string, value: string | boolean | null) => {
    change((c) =>
      section === "profile"
        ? ["github", "email", "xiaohongshu", "bilibili", "youtube"].includes(key)
          ? { ...c, social: { ...c.social, [key]: value } }
          : { ...c, profile: { ...c.profile, [key]: value } }
        : section === "teacher"
          ? { ...c, teacher: { ...c.teacher, [key]: value } }
          : section === "about"
            ? { ...c, about: { ...c.about, [key]: value } }
            : section === "course"
              ? { ...c, course: { ...c.course, [key]: value } }
              : section === "cardBackgrounds"
                ? {
                    ...c,
                    cardBackgrounds: {
                      ...c.cardBackgrounds,
                      [key]: value,
                    },
                  }
                : ({
                    ...c,
                    [section]: c[section].map((i) =>
                      i.id === selected ? { ...i, [key]: value } : i,
                    ),
                  } as HomeContent),
    );
  };
  const add = () => {
    try {
      const id = crypto.randomUUID();
      const base = { id, title: "" };
      let item: unknown;
      if (section === "projects")
        item = {
          ...base,
          title: "新项目",
          summary: "",
          description: "",
          coverId: null,
          url: "",
        };
      if (section === "articles")
        item = {
          ...base,
          summary: "",
          body: "",
          date: new Date().toISOString(),
          coverId: null,
          url: "",
        };
      if (section === "events")
        item = {
          ...base,
          title: "新的共修",
          date: "",
          location: "",
          spots: "",
          desc: "",
        };
      if (section === "resources")
        item = {
          ...base,
          title: "新的资源",
          desc: "",
          url: "",
          extractCode: "",
        };
      if (section === "photos")
        item = {
          ...base,
          title: "新的照片",
          mediaId: "",
          caption: "",
          location: "",
          source: "",
          demo: false,
        };
      if (section === "collections")
        item = {
          ...base,
          title: "新的灵感",
          description: "",
          kind: "灵感",
          imageId: null,
          url: "",
          source: "",
          demo: false,
        };
      if (section === "friends")
        item = {
          ...base,
          title: "新的朋友",
          description: "",
          url: "",
          avatarId: null,
        };
      if (section === "series")
        item = {
          ...base,
          title: "新的系列",
          tagline: "",
          intro: "",
          price: "",
          coverId: null,
        };
      if (section === "tracks")
        item = {
          ...base,
          title: "新的音乐",
          artist: "",
          audioId: "",
          coverId: null,
          demo: false,
          source: "",
          vip: false,
          category: "music",
          course: "",
          seriesId: "",
          duration: 0,
        };
      if (!isSingle) {
        change(
          (c) => ({ ...c, [section]: [...c[section], item] }) as HomeContent,
        );
        setSelected(id);
      }
    } catch (e) {
      notify(`添加失败：${(e as Error).message || "请重试"}。`);
    }
  };
  const remove = () => {
    if (
      !window.confirm(
        section === "friends"
          ? "移除这条友链？保存修改后生效。"
          : "从首页移除这条内容？保存修改后生效。",
      )
    )
      return;
    if (isSingle) return;
    // 删除条目时顺带清理其关联的媒体文件，避免产生孤儿文件
    // 后端会校验引用，仍被其他地方使用则跳过
    const victim = list.find((i) => i.id === selected) as Record<string, unknown> | undefined;
    if (victim) {
      for (const k of ["audioId", "coverId", "mediaId", "imageId", "avatarId"]) {
        const mid = victim[k];
        if (typeof mid === "string" && mid) deleteMediaById(mid);
      }
    }
    const next = list.filter((i) => i.id !== selected);
    change((c) => ({ ...c, [section]: next }) as HomeContent);
    setSelected(next[0]?.id || null);
  };
  const move = (offset: number) => {
    if (isSingle) return;
    const at = list.findIndex((i) => i.id === selected),
      to = at + offset;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[at], next[to]] = [next[to], next[at]];
    change((c) => ({ ...c, [section]: next }) as HomeContent);
  };
  // 拖拽排序：把 fromId 的条目移到 toId 的位置（toId 为 null 时移到末尾）
  const reorder = (fromId: string, toId: string | null) => {
    if (isSingle || fromId === toId) return;
    change((c) => {
      const arr = [...c[section]];
      const from = arr.findIndex((i) => i.id === fromId);
      if (from < 0) return c;
      const [item] = arr.splice(from, 1);
      if (toId === null) {
        arr.push(item);
      } else {
        // to 在移除后查找：落点=目标条目当前位置之前（与顶部插入线一致）
        const to = arr.findIndex((i) => i.id === toId);
        if (to < 0) return c;
        arr.splice(to, 0, item);
      }
      return { ...c, [section]: arr } as HomeContent;
    });
  };
  // 删除孤儿媒体（替换/删除时调用）：后端会校验是否仍被引用，失败静默忽略
  const deleteMediaById = (id: string | null | undefined) => {
    if (!id) return;
    void request(`/api/media/${id}`, { method: "DELETE" }).catch(() => {});
  };
  const file = async (
    e: ChangeEvent<HTMLInputElement>,
    field: string,
    kind: "image" | "audio",
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const currentId = selected;
    // 记录被替换掉的旧文件 ID，上传成功后删除，避免产生孤儿文件
    const oldMediaId = (entry?.[field] as string | null) || null;
    setUploading(true);
    setUploadError("");
    try {
      const data = new FormData();
      data.append("file", f);
      const m = await request<Media>(`/api/media?kind=${kind}`, {
        method: "POST",
        body: data,
        timeout: 120000,
      });
      change((c) =>
        section === "profile"
          ? { ...c, profile: { ...c.profile, [field]: m.id } }
          : section === "teacher"
            ? { ...c, teacher: { ...c.teacher, [field]: m.id } }
            : section === "about"
              ? { ...c }
              : section === "course"
                ? { ...c, course: { ...c.course, [field]: m.id } }
                : section === "cardBackgrounds"
                  ? {
                      ...c,
                      cardBackgrounds: {
                        ...c.cardBackgrounds,
                        [field]: m.id,
                      },
                    }
                  : ({
                      ...c,
                      [section]: c[section].map((i) =>
                        i.id === currentId
                          ? {
                              ...i,
                              [field]: m.id,
                              // 音频上传时顺带记录时长（秒），课程大纲展示用
                              ...(kind === "audio" && m.duration
                                ? { duration: Math.round(m.duration) }
                                : {}),
                            }
                          : i,
                      ),
                    } as HomeContent),
      );
      // 替换成功后删除旧文件（后端会校验引用，仍被使用则跳过）
      if (oldMediaId && oldMediaId !== m.id) deleteMediaById(oldMediaId);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  const field = (
    key: string,
    label: string,
    multiline = false,
    type = "text",
    placeholder = "",
  ) => (
    <label key={key}>
      {label}
      {multiline ? (
        <textarea
          value={String(entry?.[key] || "")}
          rows={key === "body" || key === "bio" ? 10 : 3}
          placeholder={placeholder}
          onChange={(e) => update(key, e.target.value)}
        />
      ) : (
        <input
          type={type}
          placeholder={placeholder}
          value={String(entry?.[key] || "")}
          onChange={(e) => update(key, e.target.value)}
        />
      )}
    </label>
  );
  const asset = (
    key: string,
    label: string,
    kind: "image" | "audio" = "image",
  ) => (
    <div className="asset-field" key={key}>
      <span>{label}</span>
      {section === "tracks" && key === "coverId" ? (
        <MusicCover
          key={String(entry?.audioId || "") + String(entry?.coverId || "")}
          className="editor-image music-cover-preview"
          coverId={entry?.coverId ? String(entry.coverId) : null}
          audioId={entry?.audioId ? String(entry.audioId) : null}
          alt="音乐封面"
        />
      ) : (
        entry?.[key] &&
        kind === "image" && (
          <SafeImage
            className="editor-image"
            src={mediaUrl(String(entry[key]))}
            alt={label}
          />
        )
      )}
      <div>
        <label className="upload-button">
          <Upload size={14} />
          {uploading ? "上传中…" : entry?.[key] ? "替换文件" : "上传文件"}
          <input
            aria-label={`上传${label}`}
            type="file"
            accept={
              kind === "image"
                ? "image/jpeg,image/png,image/webp"
                : ".mp3,.m4a,.aac,.wav"
            }
            disabled={uploading}
            onChange={(e) => void file(e, key, kind)}
          />
        </label>
        {entry?.[key] && (
          <small>{kind === "audio" ? "音频已上传" : "图片已上传"}</small>
        )}
        {entry?.[key] && key !== "mediaId" && key !== "audioId" && (
          <button className="text-button" onClick={() => update(key, null)}>
            {section === "tracks" && key === "coverId"
              ? "恢复自动封面"
              : "移除"}
          </button>
        )}
      </div>
    </div>
  );
  return (
    <Dialog
      title={`编辑${names[section]}`}
      eyebrow="修改会暂存于页面，点击底部「保存修改」后发布"
      busy={uploading}
      wide
      onClose={() => {
        if (!uploading) onClose();
      }}
    >
      <div className={`editor-layout ${isSingle ? "profile-only" : ""}`}>
        {!isSingle && (
          <>
            <small
              className="editor-reorder-hint-top"
              style={{ padding: "2px 10px", opacity: 0.55, fontSize: 12 }}
              aria-hidden="true"
            >
              拖动条目可调整顺序（触屏请用右侧 ↑ ↓）
            </small>
            <aside
              className="editor-list"
            onDragOver={(e) => {
              // 允许拖到列表空白处（移到末尾）
              e.preventDefault();
            }}
            onDrop={(e) => {
              // 只处理落在空白处的拖放；落在条目上由条目自己处理
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) reorder(id, null);
              setDragId(null);
              setDragOverId(null);
            }}
          >
            <small
              className="editor-reorder-hint"
              style={{ padding: "2px 10px", opacity: 0.55, fontSize: 12 }}
              aria-hidden="true"
            >
              拖动条目可调整顺序（触屏请用右侧 ↑ ↓）
            </small>
            {section === "series" && (
              <div style={{ padding: "6px 10px", fontSize: 13 }}>
                <span
                  style={{
                    fontSize: 11,
                    border: "1px solid currentColor",
                    borderRadius: 999,
                    padding: "0 6px",
                    marginRight: 6,
                    opacity: 0.7,
                  }}
                >
                  默认系列
                </span>
                {content?.course?.title || "正念冥想"}
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  在「课程主页」中编辑标题/介绍/封面
                </div>
              </div>
            )}
            {list.map((i, index) => {
              const isDragging = dragId === i.id;
              const isDropTarget = dragOverId === i.id && !isDragging;
              // 课时行增强：序号/时长/试听/VIP 徽章（参考得到/喜马拉雅课时管理）
              const isTrack = section === "tracks";
              const t = i as Record<string, string | boolean | null | number>;
              const dur = isTrack ? fmtDuration(t.duration) : "";
              const isDemo = isTrack && !!t.demo;
              const isVip = isTrack && !!t.vip;
              const isMed = isTrack && String(t.category || "music") === "meditation";
              return (
                <button
                  key={i.id}
                  draggable={!uploading}
                  onClick={() => {
                    if (!uploading) setSelected(i.id);
                  }}
                  className={selected === i.id ? "selected" : ""}
                  aria-grabbed={isDragging}
                  title="拖动可调整顺序"
                  style={{
                    cursor: isDragging ? "grabbing" : "grab",
                    opacity: isDragging ? 0.4 : 1,
                    // 悬停目标：顶部出现插入指示线
                    boxShadow: isDropTarget
                      ? "inset 0 3px 0 currentColor"
                      : undefined,
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", i.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(i.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverId !== i.id) setDragOverId(i.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === i.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) reorder(id, i.id);
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                >
                  <GripVertical
                    size={14}
                    aria-hidden="true"
                    style={{ opacity: 0.45, flexShrink: 0 }}
                  />
                  <small>
                    {isTrack && isMed
                      ? `第${index + 1}课`
                      : String(index + 1).padStart(2, "0")}
                  </small>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {i.title.trim() ||
                      ("body" in i
                        ? articleExcerpt(i).slice(0, 36) || "新的文字"
                        : "未命名")}
                  </span>
                  {dur && (
                    <small style={{ opacity: 0.6, flexShrink: 0 }}>{dur}</small>
                  )}
                  {isDemo && (
                    <span className="track-badge track-badge-trial">
                      <Play size={10} aria-hidden="true" />
                      试听
                    </span>
                  )}
                  {isVip && (
                    <span className="track-badge track-badge-vip">
                      <Lock size={10} aria-hidden="true" />
                      VIP
                    </span>
                  )}
                </button>
              );
            })}
            <button className="add-entry" onClick={add} disabled={uploading}>
              <Plus size={15} />
              添加{names[section]}
            </button>
          </aside>
          </>
        )}
        <div className="editor-fields">
          {entry ? (
            <>
              {!isSingle && (
                <div className="entry-tools">
                  <span>内容顺序</span>
                  <button
                    aria-label="上移内容"
                    onClick={() => move(-1)}
                    disabled={uploading || list[0]?.id === selected}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label="下移内容"
                    onClick={() => move(1)}
                    disabled={uploading || list.at(-1)?.id === selected}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="delete-entry"
                    onClick={remove}
                    disabled={uploading}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              )}
              {section === "profile" ? (
                <>
                  {asset("avatarId", "个人头像")}
                  {asset("logoId", "网站 Logo")}
                  {field("name", "名字")}
                  {field("headline", "首页标题", true)}
                  {field("introduction", "个人介绍", true)}
                  {field("description", "首页描述", true)}
                  {field("aboutBody", "认识我正文", true)}
                  {field("eyebrow", "顶部标签")}
                  {field("motto", "页脚寄语")}
                  {field("credit", "开源致谢文案", true)}
                  {field("github", "GitHub 链接")}
                  {field("email", "联系邮箱", false, "email")}
                  {field("xiaohongshu", "小红书主页链接")}
                  {field("bilibili", "Bilibili 主页链接")}
                  {field("youtube", "YouTube 频道链接")}
                </>
              ) : section === "teacher" ? (
                <>
                  {asset("avatarId", "老师照片")}
                  {field("name", "老师姓名")}
                  {field("title", "头衔 / 一句话简介", true)}
                  {field("bio", "详细介绍（回车换行即分段）", true)}
                  <TeacherCredentials
                    value={(content!.teacher.credentials || []) as {
                      id: string;
                      text: string;
                    }[]}
                    disabled={uploading}
                    onChange={(next) =>
                      change((c) => ({
                        ...c,
                        teacher: { ...c.teacher, credentials: next },
                      }))
                    }
                  />
                  <small>
                    头像从 R2 素材上传，不做转码；资质按填写顺序展示。
                  </small>
                </>
              ) : section === "about" ? (
                <>
                  {field("title", "学苑标题")}
                  {field("intro", "学苑介绍", true)}
                  <AboutServices
                    value={content!.about.services || []}
                    disabled={uploading}
                    onChange={(next) =>
                      change((c) => ({
                        ...c,
                        about: { ...c.about, services: next },
                      }))
                    }
                  />
                  <small>服务卡片按填写顺序展示；图标从下拉框选择。</small>
                  {(
                    [
                      ["wechatMp", "微信公众号"],
                      ["wechat", "微信号"],
                      ["xiaohongshu", "小红书"],
                      ["bilibili", "B 站"],
                    ] as Array<[string, string]>
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        value={
                          (content!.about.contact as Record<string, string>)[
                            key
                          ] ?? ""
                        }
                        disabled={uploading}
                        placeholder="留空则不在页面上显示"
                        onChange={(e) =>
                          change((c) => ({
                            ...c,
                            about: {
                              ...c.about,
                              contact: {
                                ...c.about.contact,
                                [key]: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                </>
              ) : section === "course" ? (
                <>
                  {asset("coverId", "课程封面")}
                  <small>不上传时，自动使用第一节课的封面。</small>
                  {field("title", "课程标题")}
                  {field("tagline", "一句话卖点")}
                  {field("intro", "课程介绍（回车换行即分段）", true)}
                  {field("price", "价格展示", false, "text", "如：¥99")}
                  <CourseReviews
                    value={(
                      content!.course.reviews || []
                    ) as {
                      id: string;
                      name: string;
                      body: string;
                    }[]}
                    disabled={uploading}
                    onChange={(next) =>
                      change((c) => ({
                        ...c,
                        course: { ...c.course, reviews: next },
                      }))
                    }
                  />
                  <small>评价按填写顺序展示在课程页；留空则不显示评价区。</small>
                </>
              ) : section === "cardBackgrounds" ? (
                <>
                  <small>
                    给 9 张主页卡片配背景图：上传后存入站内素材库，可随时替换；
                    「恢复默认」回到内置图（没有内置图的卡则无背景）。
                    建议用浅色、简洁的图，字才能看清。
                  </small>
                  {(Object.keys(CARD_BG_LABELS) as CardId[])
                    .filter((id) => id !== "photo")
                    .map((id) => {
                      const raw = entry?.[id];
                      const mid =
                        typeof raw === "string" && raw ? raw : null;
                      const effective = mid
                        ? mediaUrl(mid)
                        : CARD_BG_FALLBACK[id];
                      return (
                        <div className="asset-field" key={id}>
                          <span>{CARD_BG_LABELS[id]}</span>
                          {effective ? (
                            <SafeImage
                              className="editor-image"
                              src={effective}
                              alt={CARD_BG_LABELS[id] + "背景预览"}
                            />
                          ) : (
                            <small>当前无背景</small>
                          )}
                          <div>
                            <label className="upload-button">
                              <Upload size={14} />
                              {uploading
                                ? "上传中…"
                                : mid
                                  ? "替换文件"
                                  : "上传文件"}
                              <input
                                aria-label={
                                  "上传" + CARD_BG_LABELS[id] + "背景"
                                }
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={uploading}
                                onChange={(e) => void file(e, id, "image")}
                              />
                            </label>
                            {mid && (
                              <button
                                className="text-button"
                                onClick={() => update(id, null)}
                              >
                                恢复默认
                              </button>
                            )}
                          </div>
                          {!mid && effective && (
                            <small>当前为内置默认图</small>
                          )}
                        </div>
                      );
                    })}
                </>
              ) : (
                <>
                  {field(
                    "title",
                    section === "friends"
                      ? "网站名称"
                      : section === "articles"
                        ? "标题（可选）"
                        : "标题",
                    false,
                    "text",
                    section === "articles" ? "留空即可直接展示文字" : "",
                  )}
                  {section === "projects" && (
                    <>
                      {field("summary", "简介", true)}
                      {field("description", "项目说明", true)}
                      {field("url", "项目链接")}
                      {asset("coverId", "项目封面")}
                      <small>不设置封面时，显示默认笔记应用示意图。</small>
                    </>
                  )}
                  {section === "articles" && (
                    <>
                      {field(
                        "summary",
                        "摘要（可选）",
                        true,
                        "text",
                        "留空时，列表自动显示正文开头",
                      )}
                      <ArticleDateEditor
                        value={String(entry.date)}
                        timeZone={content!.location.timeZone}
                        onChange={(value) => update("date", value)}
                      />
                      {field("body", "正文", true)}
                      {field("url", "外部文章链接（可选）")}
                      {asset("coverId", "文章封面（可选）")}
                      <small>
                        不上传封面即使用纯文字布局；已有封面可以直接移除。
                      </small>
                    </>
                  )}
                  {section === "events" && (
                    <>
                      {field(
                        "date",
                        "时间",
                        false,
                        "text",
                        "如：10月20日 周日 14:00",
                      )}
                      {field("location", "地点")}
                      {field(
                        "spots",
                        "名额",
                        false,
                        "text",
                        "如：限20人/剩余5席",
                      )}
                      {field("desc", "简介", true)}
                      <small>前 3 条展示在首页 5 号卡“线下共修”上。</small>
                    </>
                  )}
                  {section === "resources" && (
                    <>
                      {field("desc", "简介", true)}
                      {field("url", "网盘链接", false, "url", "https://…")}
                      {field("extractCode", "提取码（可空）")}
                      <small>
                        链接与提取码仅对 VIP / 管理员可见，普通访客只能看到标题和简介。
                      </small>
                    </>
                  )}
                  {section === "series" && (
                    <>
                      {field("title", "系列名称")}
                      {field("tagline", "一句话卖点")}
                      {field("intro", "系列介绍（回车换行即分段）", true)}
                      {field(
                        "price",
                        "价格展示",
                        false,
                        "text",
                        "如：¥99 / 会员畅听",
                      )}
                      {asset("coverId", "系列封面")}
                      <small>
                        不上传封面时，自动使用该系列第一节课的封面。
                      </small>
                      <small>
                        系列删除后，其下课时自动归入默认系列（课程主页）。
                      </small>
                    </>
                  )}
                  {section === "photos" && (
                    <>
                      {asset("mediaId", "照片")}
                      {field("caption", "照片说明", true)}
                      {field("location", "拍摄地点")}
                    </>
                  )}
                  {section === "collections" && (
                    <>
                      <label>
                        分类
                        <select
                          aria-label="分类"
                          value={String(entry.kind)}
                          onChange={(e) => update("kind", e.target.value)}
                        >
                          {["图片", "网站", "灵感"].map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </label>
                      {field("description", "说明", true)}
                      {field("url", "来源链接")}
                      {asset("imageId", "灵感图片")}
                    </>
                  )}
                  {section === "friends" && (
                    <>
                      {field("description", "一句话介绍", true)}
                      {field("url", "网站链接", false, "url")}
                      {asset("avatarId", "友链头像")}
                      <small>
                        链接需以 https:// 或 http:// 开头；头像可留空。
                      </small>
                    </>
                  )}
                  {section === "tracks" && (
                    <>
                      {field("artist", "艺术家")}
                      <label>
                        分类
                        <select
                          aria-label="分类"
                          value={String(entry?.category || "music")}
                          onChange={(e) => update("category", e.target.value)}
                        >
                          <option value="music">音乐</option>
                          <option value="meditation">冥想课程</option>
                        </select>
                      </label>
                      {asset("audioId", "音乐", "audio")}
                      {asset("coverId", "音乐封面")}
                      <label className="vip-toggle">
                        <input
                          type="checkbox"
                          checked={!!entry?.vip}
                          onChange={(e) => update("vip", e.target.checked)}
                        />
                        VIP 付费内容（访客需密码解锁才能收听）
                      </label>
                      <small>
                        自动读取歌曲内嵌封面，没有封面时显示默认唱片；也可以上传自己的封面。
                      </small>
                    </>
                  )}
                  {["photos", "collections", "tracks"].includes(section) &&
                    field("source", "素材来源（可选）")}
                </>
              )}
              {uploadError && (
                <p role="alert" className="form-error">
                  {uploadError}
                </p>
              )}
              <div className="editor-done">
                <button
                  className="button dark"
                  disabled={uploading}
                  onClick={onClose}
                >
                  {section === "friends" ? "返回友链预览" : "返回首页预览"}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-content">
              <ImageIcon size={32} />
              <p>添加第一条内容，开始填满这个空间。</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
