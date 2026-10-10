import { Flower2, Infinity as InfinityIcon, Sunrise, ArrowRight } from "lucide-react";

export function BrandHero({
  onExplore,
  onAbout,
}: {
  onExplore: () => void;
  onAbout: () => void;
}) {
  const pillars = [
    {
      icon: Flower2,
      title: "正念冥想课程",
      desc: "从入门到深入的系列课程，一节一节，陪你安住当下。",
    },
    {
      icon: InfinityIcon,
      title: "会员畅听",
      desc: "一次开通，会员期内全部课程无限畅听，新课免费听。",
    },
    {
      icon: Sunrise,
      title: "每日一签",
      desc: "每天一张冥想卡片与一句引导语，养成安心的日常仪式。",
    },
  ];
  return (
    <section className="brand-hero" aria-label="My Blog">
      <p className="brand-eyebrow">My Blog</p>
      <h1 className="brand-title">愿助你忆起生命的奇迹</h1>
      <p className="brand-sub">
        一所关于生命修行与身心疗愈的学苑——正念冥想系列课程、女性觉醒系列课程、止语静心系列课程，陪你链接高我，找到灵魂回家的路。
      </p>
      <div className="brand-ctas">
        <button type="button" className="brand-cta primary" onClick={onExplore}>
          开始冥想 <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="brand-cta ghost" onClick={onAbout}>
          了解学苑
        </button>
      </div>
      <div className="brand-pillars">
        {pillars.map(({ icon: Icon, title, desc }) => (
          <div className="brand-pillar" key={title}>
            <span className="brand-pillar-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
