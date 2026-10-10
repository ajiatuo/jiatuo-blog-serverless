import { useMemo, useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";
import { Cat } from "./Common";
import { useSite } from "../store";
import { compact } from "../../../shared/model";

const SEALS = ["红龙","白风","蓝夜","黄种子","红蛇","白世界桥","蓝手","黄星星","红月","白狗","蓝猴","黄人类","红天行者","白巫师","蓝鹰","黄战士","红地球","白镜","蓝风暴","黄太阳"];
const TONES = ["磁性","月亮","电力","自我存在","超频","韵律","共振","银河","太阳","行星","光谱","水晶","宇宙"];
const COLORS = ["红","白","蓝","黄"];

const SEAL_LESSONS: Record<string, string> = {
  "红龙": "别再当巨婴了，今天自己哄自己。",
  "白风": "管住嘴，少说那句会后悔的话。",
  "蓝夜": "别emo了，梦里啥都有，醒来干活。",
  "黄种子": "种下的别天天刨出来看，发芽要时间。",
  "红蛇": "身体在报警，别拿咖啡当饭吃。",
  "白世界桥": "放下那个早就该放下的人/事。",
  "蓝手": "手别闲着，做点实际的。",
  "黄星星": "别追求完美了，完成比完美重要。",
  "红月": "情绪上头时，先喝水别说话。",
  "白狗": "对爱的人好点，别总当理所当然。",
  "蓝猴": "别太严肃，笑一个，皱纹都少两条。",
  "黄人类": "别跟人较劲，跟自己和解。",
  "红天行者": "出门走走，别在屋里发霉。",
  "白巫师": "别信玄学了，信自己。",
  "蓝鹰": "站高点看，别为小事纠结。",
  "黄战士": "别怂，该问就问，该说就说。",
  "红地球": "脚踏实地，别飘。",
  "白镜": "照照镜子，看看自己是不是双标了。",
  "蓝风暴": "想发火？先数到十。",
  "黄太阳": "晒晒太阳，补补正能量。",
};

function getMayan(date: Date) {
  const ref = new Date(1987, 6, 3);
  const days = Math.floor((date.getTime() - ref.getTime()) / 86400000);
  const kin = ((days % 260) + 260) % 260 + 1;
  const sealIdx = (kin - 1) % 20;
  const toneIdx = (kin - 1) % 13;
  return { kin, seal: SEALS[sealIdx], tone: TONES[toneIdx], color: COLORS[sealIdx % 4] };
}

export function DailyCard() {
  const { stats, checkin, notify, home, content } = useSite();
  const timeZoneChanged = home?.content.location.timeZone !== content?.location.timeZone;
  const [pending, setPending] = useState(false);
  const now = useMemo(() => new Date(), []);
  const mayan = useMemo(() => getMayan(now), [now]);
  const lesson = SEAL_LESSONS[mayan.seal] || "";

  return (
    <section className="card checkin-card">
      <span className="eyebrow">玛雅调频</span>
      <div className="checkin-main">
        <div>
          <h2>{mayan.color}{mayan.tone}的{mayan.seal}</h2>
          <div className="checkin-greeting">
            <Cat />
            <span>
              {stats?.checkedIn
                ? `正念完成，累计修习 ${stats.checkins} 天。${lesson}`
                : lesson}
            </span>
          </div>
        </div>
        <button
          className="button lime"
          disabled={pending || !stats || stats.checkedIn || timeZoneChanged}
          onClick={async () => {
            setPending(true);
            try { await checkin(); }
            catch (e) { notify((e as Error).message); }
            finally { setPending(false); }
          }}
        >
          {timeZoneChanged ? "保存后签到" : pending ? "签到中…" : stats?.checkedIn ? "正念完成" : "完成今日调频"}
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

export default DailyCard;
