import { useMemo } from "react";
import { Sparkles, Play } from "lucide-react";
import "./DailyCard.css";

// 30 句冥想引导语，按日期轮换（每天一句，一个月不重样）
const QUOTES = [
  "把注意力带回呼吸，吸气时知道吸气，呼气时知道呼气。",
  "你不需要赶走念头，只需要不再跟着它们走。",
  "此刻的你，已经足够完整。",
  "让肩膀松下来，让下巴松下来，让心松下来。",
  "每一次呼吸，都是一次重新开始。",
  "观察情绪，如看天边的云，来了又去。",
  "身体是心灵的房子，先安顿好身体。",
  "慢下来，才能听见内心的声音。",
  "接纳此刻的一切，包括不完美的自己。",
  "把紧绷的眉心揉开，把皱起的心抚平。",
  "专注当下，是给自己最好的礼物。",
  "念头只是访客，你才是这个家的主人。",
  "深呼吸，把疲惫呼出去，把平静吸进来。",
  "不需要成为别人，安住自己就好。",
  "感受脚底与大地的连接，你被稳稳托住。",
  "让心像湖面一样，渐渐平静下来。",
  "每一个当下，都是全新的开始。",
  "放下评判，只是如实地观察。",
  "温柔地对待自己，像对待一位老朋友。",
  "呼吸是锚，把飘走的心轻轻带回来。",
  "允许一切发生，允许一切流过。",
  "静坐十分钟，胜过忙碌一整天。",
  "把注意力从手机收回来，还给自己。",
  "此刻没有待办事项，只有呼吸。",
  "感受心跳，它一直在为你努力。",
  "烦恼如雾，静坐如风，雾终会散。",
  "你比你的念头更宽广，比情绪更深远。",
  "微笑一下，让脸部肌肉记住松弛。",
  "今天，也请好好照顾自己。",
  "安住当下，即是修行。",
];

function quoteIndexFor(date: Date): number {
  // 按日期轮换：用年月日做种子，保证同一天全站同一句
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return (y * 372 + m * 31 + d) % QUOTES.length;
}

function formatDate(date: Date): string {
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · 星期${week}`;
}

export function DailyCard({ onStart }: { onStart?: () => void }) {
  const now = useMemo(() => new Date(), []);
  const quote = QUOTES[quoteIndexFor(now)];

  return (
    <section className="daily-card" aria-label="每日一签">
      <div className="daily-card-top">
        <span className="daily-card-eyebrow">
          <Sparkles size={13} /> 每日一签
        </span>
        <span className="daily-card-date">{formatDate(now)}</span>
      </div>
      <h3 className="daily-card-quote">「{quote}」</h3>
      <p className="daily-card-sub">今天，留 10 分钟给自己</p>
      {onStart && (
        <button
          type="button"
          className="daily-card-btn"
          onClick={onStart}
        >
          <Play size={15} fill="currentColor" /> 今日冥想
        </button>
      )}
    </section>
  );
}

export default DailyCard;
