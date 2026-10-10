import { useEffect, useState } from "react";
import { Users, Clock, Play, CalendarCheck } from "lucide-react";
import "./GroupSession.css";

// 每日共修（简化版）：固定每晚 21:00–21:30，不依赖 Durable Objects。
// - 今日主题按一年中的天数轮换
// - 预约状态存在 localStorage（按天）
// - 共修进行中时通过 onJoin 回调交由父组件播放当日共修音频

const SESSION_START_MIN = 21 * 60; // 21:00
const SESSION_END_MIN = 21 * 60 + 30; // 21:30

// 展示用基数：正式版应替换为后端真实统计
const BASE_JOIN_COUNT = 128;

const DAILY_THEMES = [
  "把注意力，轻轻带回呼吸",
  "允许一切，如其所是",
  "今晚，只陪伴自己",
  "吸气接纳，呼气放下",
  "回到身体，回到当下",
  "每一刻，都是新的开始",
  "静坐，是给心灵的拥抱",
  "不需要完美，只需要出现",
];

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `momo-groupsession-${d.getFullYear()}${m}${day}`;
}

function themeOfToday(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_THEMES[dayOfYear % DAILY_THEMES.length];
}

export function GroupSessionCard({ onJoin }: { onJoin?: () => void }) {
  const [reserved, setReserved] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    try {
      setReserved(localStorage.getItem(todayKey()) === "1");
    } catch {
      /* 忽略存储异常 */
    }
    // 每 30 秒刷新一次时间，保证"进行中"状态准时切换
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes();
  const inSession = mins >= SESSION_START_MIN && mins < SESSION_END_MIN;

  const reserve = () => {
    try {
      localStorage.setItem(todayKey(), "1");
    } catch {
      /* 忽略存储异常 */
    }
    setReserved(true);
  };

  // 展示逻辑：固定基数 + 本人预约；正式版接入后端真实计数后替换
  const joinCount = BASE_JOIN_COUNT + (reserved ? 1 : 0);

  return (
    <section className="card groupsession-card" aria-label="每日共修">
      <div className="gs-glow" aria-hidden="true" />
      <span className="eyebrow gs-eyebrow">DAILY PRACTICE · 每日共修</span>
      <h2>今晚 21:00，一起静坐</h2>
      <p className="gs-theme">「{themeOfToday()}」</p>
      <p className="gs-time">
        <Clock size={13} aria-hidden="true" /> 每晚 21:00 – 21:30 · 30 分钟
      </p>

      {inSession ? (
        <div className="gs-live">
          <span className="gs-live-row">
            <span className="gs-live-dot" aria-hidden="true" />
            共修进行中
          </span>
          <button type="button" className="button gs-join" onClick={onJoin}>
            <Play size={15} aria-hidden="true" /> 进入共修
          </button>
        </div>
      ) : reserved ? (
        <p className="gs-reserved">
          <CalendarCheck size={15} aria-hidden="true" /> 已预约 · 今晚 21:00 见
        </p>
      ) : (
        <button type="button" className="button gs-reserve" onClick={reserve}>
          预约参加
        </button>
      )}

      <small className="gs-count">
        <Users size={12} aria-hidden="true" /> 已预约 {joinCount} 人
        <span className="gs-count-note">（人数为展示效果）</span>
      </small>
    </section>
  );
}
