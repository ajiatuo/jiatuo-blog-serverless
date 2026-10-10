import { Heart, Leaf, Flower2, Users, MoonStar} from "lucide-react";
import { PageEditButton } from "./Common";
import {
  mediaUrl,
  DEFAULT_ABOUT,
  DEFAULT_TEACHER,
  type About,
  type AboutServiceIcon,
  type Teacher,
} from "../../../shared/model";

// 服务卡片图标：数据里存 key，渲染时映射到 lucide 图标（编辑器里下拉选择）
const aboutIcons: Record<AboutServiceIcon, typeof Heart> = {
  heart: Heart,
  leaf: Leaf,
  flower: Flower2,
  users: Users,
  moon: MoonStar,
};

// 关于学苑页：内容来自 content.about（独立编辑器维护），不再是硬编码。
export function AboutSection({
  about,
  onEdit,
}: {
  about?: About;
  onEdit?: () => void;
} = {}) {
const a = about ?? DEFAULT_ABOUT;
const contactRows = (
  [
    ["微信公众号", a.contact.wechatMp],
    ["微信号", a.contact.wechat],
    ["小红书", a.contact.xiaohongshu],
    ["B 站", a.contact.bilibili],
  ] as Array<[string, string]>
).filter(([, v]) => v.trim());
return (
<section className="about-section" aria-label="关于My Blog">
<div className="about-head">
<div>
<p className="brand-eyebrow">关于学苑 · ABOUT</p>
<h2 className="about-title">{a.title}</h2>
</div>
{onEdit && <PageEditButton onEdit={onEdit} label="编辑介绍" />}
</div>
<p className="about-intro">{a.intro}</p>
<div className="about-services">
{a.services.map((s) => {
const Icon = aboutIcons[s.icon] ?? Heart;
return (
<div className="about-service" key={s.id}>
<span className="about-service-icon" aria-hidden="true">
<Icon size={20} />
</span>
<div>
<h3>{s.title}</h3>
<p>{s.desc}</p>
</div>
</div>
);
})}
</div>
{contactRows.length > 0 && (
<div className="about-contact">
<h3>联系我们</h3>
{contactRows.map(([label, value]) => (
<p key={label}>{label}：{value}</p>
))}
</div>
)}
</section>
);
}

// 师资介绍页：数据来自 content.teacher（独立编辑器维护），不再是硬编码占位。
// 样式复用 about-* 系列类 + 少量内联样式，不新增 CSS 文件/规则。
export function TeacherSection({
  teacher,
  onEdit,
}: {
  teacher: Teacher;
  onEdit?: () => void;
}) {
  const t = teacher ?? DEFAULT_TEACHER;
  const name = t.name.trim();
  const title = t.title.trim();
  const bio = t.bio
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const creds = t.credentials.filter((c) => c.text.trim());
  const hasContent = !!name || !!title || bio.length > 0 || creds.length > 0;
  return (
    <section className="about-section" aria-label="师资介绍">
      <div className="about-head">
        <div>
          <p className="brand-eyebrow">师资介绍 · TEACHER</p>
          <h2 className="about-title">{name || "师资介绍"}</h2>
        </div>
        {onEdit && <PageEditButton onEdit={onEdit} label="编辑" />}
      </div>
      {t.avatarId && (
        <div className="teacher-photo-wrap">
          <img
            src={mediaUrl(t.avatarId)}
            alt={name || "老师"}
            loading="lazy"
            className="teacher-photo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      {title && <p className="about-intro">{title}</p>}
      {bio.map((p, i) => (
        <p key={i} style={{ lineHeight: 2, margin: "0 0 12px" }}>
          {p}
        </p>
      ))}
      {creds.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>资质与经历</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2.1 }}>
            {creds.map((c) => (
              <li key={c.id}>{c.text.trim()}</li>
            ))}
          </ul>
        </div>
      )}
      {!hasContent && (
        <p style={{ color: "var(--muted)", lineHeight: 2 }}>
          师资介绍正在准备中，敬请期待。
        </p>
      )}
    </section>
  );
}
