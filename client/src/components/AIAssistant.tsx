import { useState, type FormEvent } from "react";
import { SendHorizonal, Sparkles } from "lucide-react";
import { Dialog } from "./Common";
import "./AIAssistant.css";

type Msg = { role: "ai" | "user"; text: string; course?: string };

// 内置关键词 → 课程推荐映射（规则版）
// course 字段为课程展示名；父组件可通过 onPickCourse 跳转到真实课程
const RULES: { keywords: string[]; course: string; reply: string }[] = [
  {
    keywords: ["睡", "失眠", "入睡", "熬夜", "多梦", "梦"],
    course: "睡眠冥想",
    reply:
      "听起来你最近睡眠不太好。为你推荐「睡眠冥想」：睡前 15 分钟，跟着引导放松身体、放下白天的思绪。",
  },
  {
    keywords: ["焦虑", "紧张", "担心", "压力", "心慌", "不安"],
    course: "缓解焦虑",
    reply:
      "焦虑的时候，先回到呼吸。为你推荐「缓解焦虑」：用身体扫描把紧绷的部位一点点松开。",
  },
  {
    keywords: ["难过", "低落", "抑郁", "情绪", "想哭", "烦躁", "生气"],
    course: "情绪疗愈",
    reply:
      "情绪没有对错，都值得被温柔安放。推荐「情绪疗愈」：陪你接纳每一种感受，不评判、不对抗。",
  },
  {
    keywords: ["专注", "分心", "学习", "工作", "效率", "走神"],
    course: "专注力训练",
    reply:
      "想提升专注力，可以从短时正念开始。推荐「专注力训练」：每天 10 分钟，锻炼注意力的肌肉。",
  },
  {
    keywords: ["累", "疲惫", "放松", "身体", "酸痛", "肩颈", "乏力"],
    course: "身体扫描",
    reply:
      "身体累了就好好休息一下。推荐「身体扫描」：躺着听就行，跟着引导放松每一寸肌肉。",
  },
  {
    keywords: ["呼吸", "气息", "换气"],
    course: "呼吸冥想",
    reply:
      "呼吸是最简单的锚。推荐「呼吸冥想」：只关注一呼一吸，把心带回当下。",
  },
  {
    keywords: ["入门", "新手", "开始", "初学", "不会", "零基础"],
    course: "正念入门",
    reply:
      "欢迎开始正念之旅！推荐从「正念入门」听起：零基础友好，循序渐进，每天一小步。",
  },
];

const FALLBACK_REPLY =
  "我还在学习中（当前为关键词规则版）。试试跟我说说你的状态，比如「最近睡不好」「压力有点大」「想放松一下」，我来为你推荐课程。";

// TODO 接入真实 AI 大模型时的改造点：
// 1. 后端新增 POST /api/ai/chat，从环境变量 AI_API_KEY 读取密钥调用 LLM，
//    密钥绝不出现在前端代码或仓库里；
// 2. 把下面的 ruleReply 替换为：
//      const r = await fetch("/api/ai/chat", { method: "POST",
//        headers: { "Content-Type": "application/json" },
//        body: JSON.stringify({ message: input }) }).then((x) => x.json());
// 3. 保留关键词规则作为降级（AI 接口不可用时回退到规则版）。
// 注意：async 签名已预留，直接替换函数体即可。
async function ruleReply(
  input: string,
): Promise<{ text: string; course?: string }> {
  for (const r of RULES) {
    if (r.keywords.some((k) => input.includes(k))) {
      return { text: r.reply, course: r.course };
    }
  }
  return { text: FALLBACK_REPLY };
}

export function AIAssistantDialog({
  onClose,
  onPickCourse,
}: {
  onClose: () => void;
  onPickCourse?: (course: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      text: "你好，我是冥想小助手。跟我说说你最近的状态，比如「最近睡不好」「压力有点大」，我来为你推荐合适的课程。",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const r = await ruleReply(text);
      setMessages((m) => [...m, { role: "ai", text: r.text, course: r.course }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="冥想助手"
      eyebrow="GUIDE · 智能推荐（规则版）"
      onClose={onClose}
      className="ai-dialog"
    >
      <div className="ai-messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-${m.role}`}>
            <p>{m.text}</p>
            {m.role === "ai" && m.course && (
              <button
                type="button"
                className="ai-course-btn"
                onClick={() => onPickCourse?.(m.course as string)}
              >
                去看看「{m.course}」
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="ai-msg ai-ai">
            <p className="ai-typing" aria-label="正在思考">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
      </div>
      <form className="ai-input" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="说说你最近的状态…"
          aria-label="输入你的状态"
          maxLength={200}
        />
        <button
          type="submit"
          aria-label="发送"
          disabled={busy || !draft.trim()}
          className="ai-send"
        >
          <SendHorizonal size={16} aria-hidden="true" />
        </button>
      </form>
      <small className="ai-note">
        <Sparkles size={12} aria-hidden="true" />
        当前为关键词规则推荐，未接入 AI 大模型，仅供参考。
      </small>
    </Dialog>
  );
}
