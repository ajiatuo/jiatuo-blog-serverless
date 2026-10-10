import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Play,
  Pause,
  Music2,
  Volume2,
  Heart,
  Mail,
  ArrowUpRight,
  ChevronDown,
  X,
  SkipBack,
  SkipForward,
  ListMusic,
  ListOrdered,
  Repeat,
  Repeat1,
  Shuffle,
  Upload,
  Timer,
} from "lucide-react";
import { useSite } from "../store";
import {
  mediaUrl,
} from "../../../shared/model";
import { Dialog, EditButton, Empty } from "./Common";
import { MusicCover } from "./MusicCover";
import {
  nextTrackId,
  parsePlaybackMode,
  playbackModes,
  type PlaybackMode,
} from "../playback";
function stored() {
  try {
    const value = JSON.parse(
      localStorage.getItem("hejia-homepage:audio") || "{}",
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
function usePlayer() {
  const { content, auth, notify } = useSite();
  const tracks = content?.tracks || [];
  const initial = useRef(stored());
  // 开源博客版：无 VIP/付费锁定，所有曲目均可播放
  const isLocked = (
    _track: { id?: string; vip?: boolean; category?: string } | undefined,
  ) => {
    return false;
  };
  const audio = useRef<HTMLAudioElement>(null),
    source = useRef(""),
    restore = useRef(true),
    history = useRef<string[]>([]);
  // 单曲播放进度记忆：节流保存的时间戳
  const lastPosSave = useRef(0);
  // 播放统计去重：已打点的播放会话 key（trackId:source）
  const countedPlay = useRef("");
  const [id, setId] = useState<string>(
      typeof initial.current.id === "string" ? initial.current.id : "",
    ),
    [mode, setMode] = useState<PlaybackMode>(
      parsePlaybackMode(initial.current.mode),
    ),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [volume, setVolume] = useState<number>(
      Number.isFinite(initial.current.volume)
        ? Math.max(0, Math.min(1, initial.current.volume))
        : 0.4,
    ),
    [error, setError] = useState("");
  const [sleepRemain, setSleepRemain] = useState<number | null>(null);
  const [rate, setRate] = useState(() => {
    // 恢复上次倍速
    const saved = Number(initial.current.rate);
    return [1, 1.25, 1.5, 2].includes(saved) ? saved : 1;
  });
  const sleepTimeout = useRef<number | null>(null);
  const sleepEnd = useRef(0);
  const wantPlay = useRef(false);
  const track = tracks.find((t) => t.id === id);
  useEffect(() => {
    if (!tracks.some((t) => t.id === id)) {
      wantPlay.current = false;
      setId(tracks[0]?.id || "");
      audio.current?.pause();
    }
  }, [tracks, id]);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const url = mediaUrl(track?.audioId);
    const key = `${track?.id || ""}:${url}`;
    if (source.current === key) return;
    a.pause();
    source.current = key;
    setTime(0);
    setDuration(0);
    setError("");
    if (url) {
      a.src = url;
      a.load();
    } else {
      a.removeAttribute("src");
      a.load();
    }
  }, [track?.id, track?.audioId]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "hejia-homepage:audio",
        JSON.stringify({ id, time, volume, mode, rate }),
      );
    } catch {}
  }, [id, time, volume, mode, rate]);
  const play = async () => {
    const a = audio.current;
    if (!a || !track) return;
    const requestedSource = source.current;
    try {
      setError("");
      wantPlay.current = true;
      await a.play();
    } catch (error) {
      if (
        source.current !== requestedSource ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      wantPlay.current = false;
      setPlaying(false);
      setError("播放失败，请重试或更换歌曲。");
    }
  };
  const move = (next: string, autoplay: boolean, remember = true) => {
    if (!tracks.some((track) => track.id === next)) return;
    restore.current = false;
    wantPlay.current = autoplay;
    if (next === id) {
      if (audio.current) audio.current.currentTime = 0;
      setTime(0);
      if (autoplay) void play();
      return;
    }
    if (mode === "shuffle" && remember && id)
      history.current = [...history.current, id].slice(-100);
    setId(next);
  };
  const clearSleepTimer = () => {
    if (sleepTimeout.current !== null) {
      window.clearTimeout(sleepTimeout.current);
      sleepTimeout.current = null;
    }
    setSleepRemain(null);
  };
  const setSleepTimer = (minutes: number) => {
    clearSleepTimer();
    if (minutes <= 0) return;
    const totalSec = Math.round(minutes * 60);
    sleepEnd.current = Date.now() + totalSec * 1000;
    setSleepRemain(totalSec);
    sleepTimeout.current = window.setTimeout(() => {
      sleepTimeout.current = null;
      setSleepRemain(null);
      wantPlay.current = false;
      audio.current?.pause();
      setPlaying(false);
      notify("已按定时停止播放");
    }, totalSec * 1000);
  };
  const cycleRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(rate) + 1) % rates.length];
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };
  useEffect(() => {
    if (sleepRemain === null) return;
    const iv = window.setInterval(() => {
      setSleepRemain(Math.max(0, Math.round((sleepEnd.current - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [sleepRemain === null]);
  useEffect(() => () => {
    if (sleepTimeout.current !== null) window.clearTimeout(sleepTimeout.current);
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [track?.id, rate]);
  const select = (next: string) => {
    if (next !== id) move(next, playing || wantPlay.current);
  };
  // 点即播：选中并立即播放（用于歌单点击）
  const playTrack = (next: string) => {
    if (next === id) {
      if (!playing && !wantPlay.current) void play();
      return;
    }
    move(next, true);
  };
  // 手势内同步切歌并播放：iOS Safari 要求 play() 必须在用户手势内同步调用，
  // 异步 setState → onLoadedMetadata 再 play 会被拦截（NotAllowedError）。
  // 用于底栏播放键（显示曲目与当前曲目不一致时）。
  const playTrackNow = (next: string) => {
    const target = tracks.find((t) => t.id === next);
    const a = audio.current;
    if (!target || !a) return;
    if (next === id) {
      if (!playing && !wantPlay.current) void play();
      return;
    }
    const url = mediaUrl(target.audioId);
    const key = `${target.id}:${url}`;
    restore.current = false;
    wantPlay.current = true;
    setId(next);
    // 与曲目切换 useEffect 同步：手势内直接设置音源，避免重复设置
    if (source.current !== key) {
      try {
        a.pause();
      } catch {}
      source.current = key;
      setTime(0);
      setDuration(0);
      setError("");
      if (url) {
        a.src = url;
        a.load();
      } else {
        a.removeAttribute("src");
        a.load();
      }
    }
    // 手势内同步播放（iOS 放行）
    setError("");
    const requestedSource = source.current;
    a.play().catch((error: unknown) => {
      if (
        source.current !== requestedSource ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      wantPlay.current = false;
      setPlaying(false);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setError("请再点一次播放");
      } else {
        setError("播放失败，请重试或更换歌曲。");
      }
    });
  };
  const step = (offset: number) => {
    if (mode === "shuffle" && offset < 0) {
      while (history.current.length) {
        const previous = history.current.pop()!;
        if (previous !== id) {
          move(previous, playing || wantPlay.current, false);
          return;
        }
      }
    }
    const next = nextTrackId(
      tracks.map((track) => track.id),
      id,
      mode,
      offset < 0 ? "previous" : "next",
    );
    if (next) move(next, playing || wantPlay.current);
  };
  // 开源博客版：无冥想分类，stepMusic 等同于 step
  const stepMusic = step;
  const retry = () => {
    if (!audio.current) return;
    wantPlay.current = true;
    audio.current.load();
  };
  // 自然播完：清除单曲进度存档，自动播放下一首
  const handleEnded = async () => {
    const t = track;
    if (t) {
      try {
        localStorage.removeItem(`momo-playpos-${t.id}`);
      } catch {}
    }
    const next = nextTrackId(
      tracks.map((x) => x.id),
      id,
      mode,
    );
    if (next) move(next, true);
    else {
      wantPlay.current = false;
      setPlaying(false);
    }
  };
  const element = (
    <audio
      ref={audio}
      preload="metadata"
      loop={mode === "repeat-one"}
      onPlay={() => {
        wantPlay.current = false;
        setPlaying(true);
        // 播放统计：仅新播放会话打点一次（暂停后继续不重复）
        const t = track;
        if (t?.id) {
          const key = `${t.id}:${source.current}`;
          if (countedPlay.current !== key) {
            countedPlay.current = key;
            fetch("/api/stats/play", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ trackId: t.id }),
            }).catch(() => {});
          }
        }
      }}
      onPause={() => {
        setPlaying(false);
        // 暂停时保存单曲播放进度（自然播完由 ended 清除，此处跳过）
        const a = audio.current;
        if (track?.id && a && !a.ended) {
          try {
            localStorage.setItem(
              `momo-playpos-${track.id}`,
              String(a.currentTime),
            );
          } catch {}
        }
      }}
      onTimeUpdate={() => {
        const a = audio.current;
        setTime(a?.currentTime || 0);
        // 节流 5 秒保存单曲播放进度
        if (
          track?.id &&
          a &&
          !a.ended &&
          Date.now() - lastPosSave.current > 5000
        ) {
          lastPosSave.current = Date.now();
          try {
            localStorage.setItem(
              `momo-playpos-${track.id}`,
              String(a.currentTime),
            );
          } catch {}
        }
      }}
      onLoadedMetadata={() => {
        const a = audio.current!;
        setDuration(Number.isFinite(a.duration) ? a.duration : 0);
        let restored = false;
        if (restore.current && track?.id === initial.current.id) {
          a.currentTime = Math.min(
            Number(initial.current.time) || 0,
            Math.max(0, a.duration - 0.1),
          );
          restored = true;
        }
        restore.current = false;
        // 单曲播放进度记忆：存档 >10s 且距结尾 >15s 才跳转
        if (!restored && track?.id) {
          try {
            const saved = Number(
              localStorage.getItem(`momo-playpos-${track.id}`),
            );
            if (
              Number.isFinite(saved) &&
              saved > 10 &&
              saved < a.duration - 15
            ) {
              a.currentTime = saved;
            }
          } catch {}
        }
        if (wantPlay.current) void play();
      }}
      onError={() => {
        if (track) {
          wantPlay.current = false;
          setPlaying(false);
          setError("音乐暂时无法加载。");
        }
      }}
      onEnded={() => {
        void handleEnded();
      }}
    />
  );
  return {
    tracks,
    track,
    playing,
    time,
    duration,
    volume,
    mode,
    error,
    setVolume,
    setMode: (next: PlaybackMode) => {
      if (next !== mode) history.current = [];
      setMode(next);
    },
    toggle: () => {
      if (playing || wantPlay.current) {
        wantPlay.current = false;
        audio.current?.pause();
      } else void play();
    },
    seek: (n: number) => {
      if (audio.current && Number.isFinite(n)) {
        audio.current.currentTime = Math.max(0, Math.min(duration, n));
        setTime(audio.current.currentTime);
      }
    },
    select,
    playTrack,
    playTrackNow,
    step,
    stepMusic,
    retry,
    element,
    sleepRemain,
    setSleepTimer,
    clearSleepTimer,
    rate,
    cycleRate,
    // 开源博客版：无锁定，所有曲目可播放
    isLocked,
  };
}
type Player = ReturnType<typeof usePlayer>;
export const MusicPlayerContext = createContext<Player>(null!);
const Context = MusicPlayerContext;
export function MusicProvider({ children }: { children: ReactNode }) {
  const player = usePlayer();
  return (
    <Context.Provider value={player}>
      {player.element}
      {children}
    </Context.Provider>
  );
}
export function GithubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1.7a10.3 10.3 0 0 0-3.26 20.07c.52.1.7-.23.7-.5v-1.92c-2.87.63-3.47-1.22-3.47-1.22-.47-1.19-1.15-1.5-1.15-1.5-.94-.64.07-.63.07-.63 1.04.07 1.58 1.06 1.58 1.06.92 1.58 2.41 1.12 3 .85.1-.66.36-1.12.66-1.38-2.29-.26-4.69-1.15-4.69-5.1 0-1.12.4-2.04 1.06-2.76-.1-.26-.46-1.3.1-2.72 0 0 .87-.28 2.83 1.06A9.8 9.8 0 0 1 12 6.66c.88 0 1.76.12 2.59.35 1.96-1.34 2.82-1.06 2.82-1.06.56 1.42.21 2.46.1 2.72.66.72 1.06 1.64 1.06 2.76 0 3.97-2.4 4.84-4.7 5.1.37.32.7.95.7 1.92v2.82c0 .27.18.6.71.5A10.3 10.3 0 0 0 12 1.7Z" />
    </svg>
  );
}
const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function XiaohongshuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="3.5"
        width="21"
        height="17"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="800"
        fontSize="8"
        letterSpacing="-.5"
        fill="currentColor"
      >
        RED
      </text>
    </svg>
  );
}
function BilibiliIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7 2 3 4m7-4-3 4" />
      <rect x="2" y="6" width="20" height="15" rx="3" />
      <path d="m7 11 1 3m9-3-1 3m-6 3 2 1 2-1" />
    </svg>
  );
}
export function SectionPlayer() {
  const p = useContext(Context);
  if (!p.track) return null;
  return (
    <div className="section-player" aria-label="正在听">
      <Music2 size={14} />
      <span title={p.track.title}>{p.track.title}</span>
      <button
        aria-label={
          p.error ? "重试播放音乐" : p.playing ? "暂停音乐" : "播放音乐"
        }
        onClick={p.error ? p.retry : p.toggle}
      >
        {p.playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      {p.error && <small role="alert">播放暂不可用</small>}
    </div>
  );
}
function PlaybackProgress({
  player: p,
  label = "播放进度",
}: {
  player: Player;
  label?: string;
}) {
  return (
    <>
      <input
        className="progress"
        aria-label={label}
        type="range"
        min="0"
        max={p.duration || 1}
        step=".1"
        value={p.time}
        disabled={!p.duration}
        onChange={(e) => p.seek(Number(e.target.value))}
        style={
          {
            "--progress": `${p.duration ? (p.time / p.duration) * 100 : 0}%`,
          } as React.CSSProperties
        }
      />
      <div className="time-label">
        <span>{timeLabel(p.time)}</span>
        <span>{timeLabel(p.duration)}</span>
      </div>
    </>
  );
}
const playbackModeIcons = {
  sequential: ListOrdered,
  "repeat-all": Repeat,
  "repeat-one": Repeat1,
  shuffle: Shuffle,
};
function PlaybackModeButton({
  player: p,
  compact = false,
}: {
  player: Player;
  compact?: boolean;
}) {
  const Icon = playbackModeIcons[p.mode];
  const index = playbackModes.findIndex((mode) => mode.value === p.mode);
  const label = playbackModes[index].label;
  const next = playbackModes[(index + 1) % playbackModes.length];
  return (
    <button
      type="button"
      className={`playback-mode ${compact ? "playback-mode-compact" : "playback-mode-field"}`}
      title={`${label} · 点击切换为${next.label}`}
      aria-label={`${compact ? "播放模式" : "音乐列表播放模式"}：${label}，点击切换为${next.label}`}
      onClick={() => p.setMode(next.value)}
    >
      <Icon size={17} aria-hidden="true" />
      {!compact && <span>{label}</span>}
      {!compact && <small>切换模式</small>}
    </button>
  );
}
const formatSleepRemain = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// 睡眠定时按钮：点击弹出 15/30/60 分钟/关闭选项，倒计时结束自动暂停
export function SleepTimerButton({
  player: p,
  className = "",
  buttonClassName = "",
}: {
  player: Player;
  className?: string;
  buttonClassName?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (
        wrapRef.current &&
        event.target instanceof Node &&
        !wrapRef.current.contains(event.target)
      )
        setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const pick = (minutes: number) => {
    if (minutes <= 0) p.clearSleepTimer();
    else p.setSleepTimer(minutes);
    setMenuOpen(false);
  };
  const remain = p.sleepRemain;
  const active = remain !== null;
  return (
    <div className={`sleep-wrap ${className}`} ref={wrapRef}>
      <button
        type="button"
        className={`${buttonClassName}${active ? " is-active" : ""}`}
        aria-label={
          remain !== null
            ? `睡眠定时剩余 ${formatSleepRemain(remain)}，点击更改`
            : "睡眠定时"
        }
        title={
          remain !== null
            ? `睡眠定时剩余 ${formatSleepRemain(remain)}，点击更改`
            : "睡眠定时：15/30/60 分钟后自动暂停"
        }
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <Timer size={17} aria-hidden="true" />
        {remain !== null && (
          <span className="sleep-remain">{formatSleepRemain(remain)}</span>
        )}
      </button>
      {menuOpen && (
        <div className="sleep-popover" role="menu" aria-label="睡眠定时选项">
          {[15, 30, 60].map((m) => (
            <button
              key={m}
              type="button"
              role="menuitem"
              onClick={() => pick(m)}
            >
              {m} 分钟
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => pick(0)}>
            关闭定时
          </button>
        </div>
      )}
    </div>
  );
}

// 倍速按钮：点击循环 1x → 1.25x → 1.5x → 2x → 1x，显示当前倍速
export function RateButton({
  player: p,
  className = "",
}: {
  player: Player;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={`播放倍速 ${p.rate}x，点击切换`}
      title={`播放倍速 ${p.rate}x，点击切换`}
      onClick={p.cycleRate}
    >
      <span className="rate-text">{p.rate}x</span>
    </button>
  );
}

function PlaylistDialog({ onClose }: { onClose: () => void }) {
  const p = useContext(Context);
  const musicCount = p.tracks.filter(
    (t) => (t.category || "music") === "music",
  ).length;
  return (
    <Dialog
      title="音乐列表"
      eyebrow={`ON REPEAT / ${musicCount} 首歌曲`}
      wide
      className="playlist-dialog"
      onClose={onClose}
    >
      {p.track ? (
        <>
          <aside className="playlist-current" aria-label="当前歌曲">
            <div className="playlist-current-summary">
              <MusicCover
                className="playlist-current-cover"
                coverId={p.track.coverId}
                audioId={p.track.audioId}
                alt={`${p.track.title || "当前歌曲"} 封面`}
              />
              <div>
                <span className="playlist-current-status">
                  {p.playing ? "正在播放" : "当前选择"}
                </span>
                <h3>{p.track.title || "未命名歌曲"}</h3>
                {p.track.artist && <p>{p.track.artist}</p>}
              </div>
            </div>
            <div className="playlist-controls">
              <button
                aria-label="上一首"
                disabled={musicCount < 2}
                onClick={() => p.stepMusic(-1)}
              >
                <SkipBack size={20} />
              </button>
              <button
                className="play-button"
                aria-label={p.playing ? "暂停音乐" : "播放音乐"}
                onClick={p.toggle}
              >
                {p.playing ? (
                  <Pause size={20} fill="currentColor" />
                ) : (
                  <Play size={20} fill="currentColor" />
                )}
              </button>
              <button
                aria-label="下一首"
                disabled={musicCount < 2}
                onClick={() => p.stepMusic(1)}
              >
                <SkipForward size={20} />
              </button>
              <SleepTimerButton player={p} />
              <RateButton player={p} />
            </div>
            <PlaybackModeButton player={p} />
            <PlaybackProgress player={p} label="音乐列表播放进度" />
            {p.error && (
              <div className="audio-error" role="alert">
                {p.error}
                <button onClick={p.retry}>重试</button>
              </div>
            )}
          </aside>
          <ol className="playlist-list" aria-label="全部歌曲">
            {p.tracks
              .filter((track) => (track.category || "music") === "music")
              .map((track, index) => (
              <li key={track.id}>
                <button
                  className="playlist-track"
                  aria-label={`切换到 ${track.title || "未命名歌曲"}`}
                  aria-pressed={p.track?.id === track.id}
                  onClick={() => p.playTrack(track.id)}
                >
                  <span className="playlist-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <MusicCover
                    className="playlist-track-cover"
                    coverId={track.coverId}
                    audioId={track.audioId}
                    alt=""
                  />
                  <span className="playlist-track-info">
                    <strong>
                      {track.title || "未命名歌曲"}
                    </strong>
                    {track.artist && <small>{track.artist}</small>}
                  </span>
                  {p.track?.id === track.id && (
                    <span className="playlist-track-status">
                      {p.playing ? "播放中" : "已选择"}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <Empty>
          <Music2 size={32} />
          还没有歌曲，添加音乐后就会显示在这里。
        </Empty>
      )}
    </Dialog>
  );
}
export function MusicCard({
  onEdit,
  onContact,
}: {
  onEdit: () => void;
  onContact: () => void;
}) {
  const p = useContext(Context);
  const { content, stats, like, notify } = useSite();
  const [liking, setLiking] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const volumeOptions = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeVolume = (event: PointerEvent) => {
      const options = volumeOptions.current;
      if (
        options?.open &&
        event.target instanceof Node &&
        !options.contains(event.target)
      )
        options.open = false;
    };
    document.addEventListener("pointerdown", closeVolume);
    return () => document.removeEventListener("pointerdown", closeVolume);
  }, []);
  return (
    <section className="card music-card" aria-label="音乐与联系">
      <div className="music-heading">
        <Music2 size={25} />
        <div>
          <span className="eyebrow">ON REPEAT</span>
          <h2>此刻的旋律</h2>
        </div>
        <div className="music-actions">
          <EditButton onClick={onEdit} label="编辑音乐" />
          <PlaybackModeButton player={p} compact />
          <details
            ref={volumeOptions}
            className="player-options"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.open = false;
                e.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label="调整音量" title="调整音量">
              <Volume2 size={17} />
            </summary>
            <div className="player-popover">
              <label>
                音量
                <input
                  aria-label="音量"
                  type="range"
                  min="0"
                  max="1"
                  step=".01"
                  value={p.volume}
                  onChange={(e) => p.setVolume(Number(e.target.value))}
                />
                <span className="volume-value">
                  {Math.round(p.volume * 100)}%
                </span>
              </label>
            </div>
          </details>
          <button
            className="playlist-open"
            aria-label="打开音乐列表"
            title="音乐列表"
            aria-haspopup="dialog"
            onClick={() => {
              if (volumeOptions.current) volumeOptions.current.open = false;
              setPlaylistOpen(true);
            }}
          >
            <ListMusic size={18} />
          </button>
        </div>
      </div>
      <div className="music-player">
        <MusicCover
          className="album-cover"
          coverId={p.track?.coverId}
          audioId={p.track?.audioId}
          alt={p.track ? `${p.track.title} 封面` : "音乐封面"}
        />
        <div className="music-info">
          <strong>{p.track?.title || "等一首喜欢的歌"}</strong>
          <small>{p.track?.artist || "登录后添加音乐"}</small>
          <PlaybackProgress player={p} />
        </div>
        <button
          className="play-button"
          aria-label={p.playing ? "暂停音乐" : "播放音乐"}
          disabled={!p.track}
          onClick={p.toggle}
        >
          {p.playing ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>
      </div>
      {p.error && (
        <div className="audio-error" role="alert">
          {p.error}
          <button onClick={p.retry}>重试</button>
        </div>
      )}
      <div className="social-row">
        {content?.social.github ? (
          <a
            className="social-link"
            href={content.social.github}
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon />
            <span>GitHub</span>
          </a>
        ) : (
          <button className="social-link" onClick={onContact}>
            <GithubIcon />
            <span>GitHub</span>
          </button>
        )}
        {content?.social.email ? (
          <a className="social-link" href={`mailto:${content.social.email}`}>
            <Mail size={18} />
            <span>Email</span>
          </a>
        ) : (
          <button className="social-link" onClick={onContact}>
            <Mail size={18} />
            <span>Email</span>
          </button>
        )}
        {content?.social.xiaohongshu ? (
          <a
            className="social-link xiaohongshu-link"
            href={content.social.xiaohongshu}
            target="_blank"
            rel="noreferrer"
          >
            <XiaohongshuIcon />
            <span>小红书</span>
          </a>
        ) : (
          <button
            className="social-link xiaohongshu-link"
            onClick={() => notify("小红书主页暂未公开。")}
          >
            <XiaohongshuIcon />
            <span>小红书</span>
          </button>
        )}
        {content?.social.bilibili ? (
          <a
            className="social-link bilibili-link"
            href={content.social.bilibili}
            target="_blank"
            rel="noreferrer"
          >
            <BilibiliIcon />
            <span>Bilibili</span>
          </a>
        ) : (
          <button
            className="social-link bilibili-link"
            onClick={() => notify("Bilibili 主页暂未公开。")}
          >
            <BilibiliIcon />
            <span>Bilibili</span>
          </button>
        )}
        <button
          className={`like-button ${stats?.liked ? "liked" : ""}`}
          aria-label={stats?.liked ? "取消喜欢" : "喜欢这个网站"}
          aria-pressed={stats?.liked || false}
          aria-describedby="site-like-count"
          title={
            stats
              ? `${stats.likeCount.toLocaleString("zh-CN")} 人喜欢`
              : "正在加载点赞数"
          }
          disabled={liking || !stats}
          onClick={async () => {
            setLiking(true);
            try {
              await like();
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setLiking(false);
            }
          }}
        >
          <Heart size={18} fill={stats?.liked ? "currentColor" : "none"} />
          <span
            id="site-like-count"
            className="like-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {stats
              ? new Intl.NumberFormat("zh-CN", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(stats.likeCount)
              : "—"}
          </span>
        </button>
      </div>
      {playlistOpen && (
        <PlaylistDialog onClose={() => setPlaylistOpen(false)} />
      )}
    </section>
  );
}

// 全屏播放器（移动端）：从迷你条点开展开，顶部大 ↓ 收回迷你条
// 访客一看就懂，不用学
function MusicFullPlayer({ onClose }: { onClose: () => void }) {
  const p = useContext(Context);
  const { auth } = useSite();
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const musicTracks = (p.tracks || []);
  const current = p.track;
  const isMusicActive = !!current;
  const display =
    (isMusicActive ? current : undefined) ||
    musicTracks[0] ||
    musicTracks[0];
  const progress = isMusicActive && p.duration ? (p.time / p.duration) * 100 : 0;
  // 挂载动画
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntered(true)),
    );
    return () => {
      cancelAnimationFrame(raf);
      setEntered(false);
    };
  }, []);
  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const playMusic = () => {
    if (display && display.id !== current?.id) {
      p.playTrackNow(display.id);
      return;
    }
    p.toggle();
  };
  return (
    <div
      className={`mfp-overlay${entered ? " mfp-entered" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="背景音乐播放器"
    >
      <div className="mfp-sheet">
        <div className="mfp-top">
          <button
            type="button"
            className="mfp-collapse"
            aria-label="收起播放器"
            title="收起"
            onClick={onClose}
          >
            <ChevronDown size={28} />
          </button>
          <span className="mfp-title">正在播放</span>
          <span className="mfp-spacer" aria-hidden="true" />
        </div>
        <div className="mfp-cover-wrap">
          <MusicCover
            className={`mfp-cover${isMusicActive && p.playing ? " is-playing" : ""}`}
            coverId={display?.coverId}
            audioId={display?.audioId}
            alt={display ? `${display.title || "背景音乐"} 封面` : "背景音乐封面"}
            loading="eager"
          />
        </div>
        <div className="mfp-info">
          <strong>{display?.title || "背景音乐"}</strong>
          {display?.artist && <small>{display.artist}</small>}
        </div>
        {p.error && (
          <div className="mfp-error" role="alert">
            {p.error}
            <button type="button" onClick={p.retry}>
              重试
            </button>
          </div>
        )}
        <div className="mfp-progress">
          <input
            className="progress"
            aria-label="播放进度"
            type="range"
            min="0"
            max={isMusicActive ? p.duration || 1 : 1}
            step=".1"
            value={isMusicActive ? p.time : 0}
            disabled={!isMusicActive || !p.duration}
            onChange={(e) => p.seek(Number(e.target.value))}
            style={{ "--progress": `${progress}%` } as React.CSSProperties}
          />
          <div className="mfp-time">
            <span>{isMusicActive ? timeLabel(p.time) : "0:00"}</span>
            <span>{isMusicActive ? timeLabel(p.duration) : "0:00"}</span>
          </div>
        </div>
        <div className="mfp-controls">
          <button
            type="button"
            className="mfp-btn"
            aria-label="上一首"
            onClick={() => p.stepMusic(-1)}
          >
            <SkipBack size={26} fill="currentColor" />
          </button>
          <button
            type="button"
            className="mfp-btn mfp-play"
            aria-label={isMusicActive && p.playing ? "暂停" : "播放"}
            onClick={playMusic}
          >
            {isMusicActive && p.playing ? (
              <Pause size={28} fill="currentColor" />
            ) : (
              <Play size={28} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="mfp-btn"
            aria-label="下一首"
            onClick={() => p.stepMusic(1)}
          >
            <SkipForward size={26} fill="currentColor" />
          </button>
        </div>
        <div className="mfp-tools">
          <button
            type="button"
            className="mfp-tool"
            aria-label="打开音乐列表"
            onClick={() => setPlaylistOpen(true)}
          >
            <ListMusic size={20} />
            <span>列表</span>
          </button>
          <SleepTimerButton
            player={p}
            buttonClassName="mfp-tool"
          />
          <RateButton player={p} className="mfp-tool" />
        </div>
      </div>
      {playlistOpen && (
        <PlaylistDialog onClose={() => setPlaylistOpen(false)} />
      )}
    </div>
  );
}

// 底部通栏音乐播放条（网易云风格）：只控制非冥想类曲目，与冥想播放器互斥
// （共用同一个 <audio>，切歌即天然互斥）。关闭后回到小悬浮钮，可重新打开。
// 移动端：点迷你条主体展开全屏播放器（MusicFullPlayer），顶部大 ↓ 收回。
export function MusicBottomBar({ onUpload }: { onUpload?: () => void }) {
  const p = useContext(Context);
  const { auth } = useSite();
  const [dismissed, setDismissed] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const musicTracks = (p.tracks || []);
  const current = p.track;
  const isMusicActive = !!current;
  const display =
    (isMusicActive ? current : undefined) ||
    musicTracks[0] ||
    musicTracks[0];
  const progress = isMusicActive && p.duration ? (p.time / p.duration) * 100 : 0;

  // 换歌时自动重新展开底栏
  useEffect(() => {
    if (isMusicActive) setDismissed(false);
  }, [display?.id]);

  // 侧边面板滑入动画：挂载后下一帧加 .mbb-entered 触发 transition
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (dismissed) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntered(true)),
    );
    return () => {
      cancelAnimationFrame(raf);
      setEntered(false);
    };
  }, [dismissed]);

  // 底栏显示时给 body 加 class，页面底部留出空间不被遮挡
  const barVisible = musicTracks.length > 0 && !dismissed;
  useEffect(() => {
    document.body.classList.toggle("has-music-bar", barVisible);
    return () => document.body.classList.remove("has-music-bar");
  }, [barVisible]);

  // 若显示曲目与当前曲目不一致（刚切到冥想/未选中），手势内同步切歌并播放，
  // 避免异步 setState 后 iOS 拦截 play()；一致时直接 toggle
  const playMusic = () => {
    if (display && display.id !== current?.id) {
      p.playTrackNow(display.id);
      return;
    }
    p.toggle();
  };
  const nextMusic = () => {
    // 音乐内切歌，迷你播放器 UI 保持同步
    p.stepMusic(1);
  };
  const handleClose = () => {
    if (isMusicActive && p.playing) p.toggle();
    // 先播退出动画（320ms），再卸载面板，避免生硬消失
    setEntered(false);
    window.setTimeout(() => setDismissed(true), 320);
  };

  // 无背景音乐时：管理员显示上传入口（带文字，一眼能找到），访客不显示
  if (!musicTracks.length) {
    if (!auth?.isAdmin || !onUpload) return null;
    return (
      <button
        className="mbb-fab mbb-fab-empty"
        aria-label="上传背景音乐"
        title="还没有背景音乐，点击上传"
        onClick={onUpload}
      >
        <Music2 size={22} />
        <span className="mbb-fab-text">传音乐</span>
      </button>
    );
  }
  // 关闭后：悬浮钮（PC 右侧中间 44px 圆钮，播放时显示旋转封面）
  if (dismissed) {
    return (
      <button
        className={`mbb-fab${isMusicActive && p.playing ? " is-playing" : ""}`}
        aria-label="展开背景音乐播放器"
        title="背景音乐（点击展开）"
        onClick={() => setDismissed(false)}
      >
        {isMusicActive && display?.coverId ? (
          <MusicCover
            className="mbb-fab-cover"
            coverId={display.coverId}
            audioId={display.audioId}
            alt="背景音乐封面"
            loading="eager"
          />
        ) : (
          <Music2 size={22} />
        )}
        <span className="mbb-fab-text">音乐</span>
      </button>
    );
  }
  return (
    <div
      className={`music-bottombar${isMusicActive && p.playing ? " is-playing" : ""}${entered ? " mbb-entered" : ""}`}
      role="region"
      aria-label="背景音乐播放器"
    >
      {/* 播放失败提示（移动端之前失败无任何反馈） */}
      {p.error && (
        <div className="mbb-error" role="alert">
          {p.error}
          <button
            type="button"
            onClick={p.retry}
            aria-label="重试播放"
          >
            重试
          </button>
        </div>
      )}
      {/* 移动端细进度条（顶部） */}
      <input
        className="mbb-progress-line"
        aria-label="播放进度"
        type="range"
        min="0"
        max={isMusicActive ? p.duration || 1 : 1}
        step=".1"
        value={isMusicActive ? p.time : 0}
        disabled={!isMusicActive || !p.duration}
        onChange={(e) => p.seek(Number(e.target.value))}
        style={{ "--progress": `${progress}%` } as React.CSSProperties}
      />
      <div className="mbb-main">
        <button
          type="button"
          className="mbb-expand-hit"
          onClick={() => setFullOpen(true)}
          aria-label="展开完整播放器"
          title="点击展开完整播放器"
        >
          <MusicCover
            className="mbb-cover"
            coverId={display?.coverId}
            audioId={display?.audioId}
            alt={display ? `${display.title || "背景音乐"} 封面` : "背景音乐封面"}
            loading="eager"
          />
          <span className="mbb-info">
            <strong title={display?.title || "背景音乐"}>
              {display?.title || "背景音乐"}
            </strong>
            {display?.artist && <small title={display.artist}>{display.artist}</small>}
          </span>
        </button>
        <div className="mbb-controls">
          <button
            className="mbb-btn mbb-play"
            aria-label={isMusicActive && p.playing ? "暂停" : "播放"}
            onClick={playMusic}
          >
            {isMusicActive && p.playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button className="mbb-btn" aria-label="下一首" onClick={nextMusic}>
            <SkipForward size={18} />
          </button>
        </div>
        <div className="mbb-progress-wrap">
          <span className="mbb-time">{isMusicActive ? timeLabel(p.time) : "0:00"}</span>
          <input
            className="progress mbb-progress"
            aria-label="播放进度"
            type="range"
            min="0"
            max={isMusicActive ? p.duration || 1 : 1}
            step=".1"
            value={isMusicActive ? p.time : 0}
            disabled={!isMusicActive || !p.duration}
            onChange={(e) => p.seek(Number(e.target.value))}
            style={{ "--progress": `${progress}%` } as React.CSSProperties}
          />
          <span className="mbb-time">{isMusicActive ? timeLabel(p.duration) : "0:00"}</span>
        </div>
        <div className="mbb-tools">
          <button
            className="mbb-btn"
            aria-label="打开音乐列表"
            title="音乐列表"
            onClick={() => setPlaylistOpen(true)}
          >
            <ListMusic size={18} />
          </button>
          <SleepTimerButton player={p} buttonClassName="mbb-btn" />
          <RateButton player={p} className="mbb-btn" />
          {auth?.isAdmin && onUpload && (
            <button
              className="mbb-btn"
              aria-label="上传音乐"
              title="上传音乐"
              onClick={onUpload}
            >
              <Upload size={16} />
            </button>
          )}
          <button
            className="mbb-btn mbb-close"
            aria-label="关闭播放条"
            title="关闭播放条"
            onClick={handleClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {playlistOpen && (
        <PlaylistDialog onClose={() => setPlaylistOpen(false)} />
      )}
      {fullOpen && <MusicFullPlayer onClose={() => setFullOpen(false)} />}
    </div>
  );
}

// 兼容旧导出名（App.tsx 已改为 MusicBottomBar，此别名仅防漏改）
export const FloatingPlayer = MusicBottomBar;
