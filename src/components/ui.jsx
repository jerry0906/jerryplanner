import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Repeat, X } from "lucide-react";
import { CATEGORIES, DAY_LABELS, REPEAT_OPTIONS, TAGS, TAG_KEYS } from "../lib/core";
import { ai } from "../lib/supabase";

export const Header = ({ title, sub, right }) => (
  <div className="flex items-start justify-between pb-3 pt-1">
    <div>
      <h1 className="text-[20px] font-extrabold tracking-tight text-slate-800">{title}</h1>
      {sub && <p className="mt-0.5 text-[11.5px] text-slate-400">{sub}</p>}
    </div>
    {right}
  </div>
);

export const SectionTitle = ({ children }) => (
  <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{children}</p>
);

export const Spinner = ({ label }) => (
  <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
    <Loader2 className="h-6 w-6 animate-spin" />
    {label && <p className="text-[12px] font-semibold">{label}</p>}
  </div>
);

export function TaskCard({ task, ltg, done, dragging, onGrab, onToggle }) {
  return (
    <div onPointerDown={onGrab}
         className={`mb-2 flex touch-none cursor-grab items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm active:cursor-grabbing ${
           dragging ? "opacity-30" : ""
         }`}>
      <button onPointerDown={(e) => e.stopPropagation()} onClick={onToggle}
              aria-label="완료 처리"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                done ? "border-blue-500 bg-blue-500" : "border-slate-200"
              }`}>
        {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-semibold ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {ltg && <span className="font-medium text-slate-400">{ltg.title} <span className="text-slate-300">›</span> </span>}
          {task.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${TAGS[task.type_tag]?.chip}`}>
            {TAGS[task.type_tag]?.label}
          </span>
          {task.repeat_rule !== "none" && (
            <span className="flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-500">
              <Repeat className="h-2.5 w-2.5" />
              {task.repeat_rule === "daily" ? "매일" : task.repeat_rule === "weekly" ? "매주" : "요일 지정"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* 오늘 계획을 모두 끝냈을 때 한 번 재생 */
export function Celebration({ show }) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!show) return;
    const colors = ["#0EA5E9", "#F59E0B", "#D946EF", "#10B981", "#3B82F6", "#F43F5E"];
    setPieces(Array.from({ length: 28 }, (_, i) => ({
      id: i, left: Math.random() * 100, size: 6 + Math.random() * 6,
      color: colors[i % colors.length], duration: 1.7 + Math.random() * 1.1,
      delay: Math.random() * 0.35, rotate: Math.round(Math.random() * 360),
    })));
  }, [show]);

  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <style>{`
        @keyframes confetti-fall { 0%{transform:translateY(-16px) rotate(0);opacity:1} 100%{transform:translateY(110vh) rotate(560deg);opacity:0} }
        @keyframes celebrate-pop { 0%{transform:scale(.85) translateY(-8px);opacity:0} 60%{transform:scale(1.04);opacity:1} 100%{transform:scale(1);opacity:1} }
      `}</style>
      {pieces.map((p) => (
        <span key={p.id} className="absolute top-0 block rounded-sm"
              style={{
                left: `${p.left}%`, width: p.size, height: p.size * 1.6, backgroundColor: p.color,
                animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
                transform: `rotate(${p.rotate}deg)`,
              }} />
      ))}
      <div className="absolute inset-x-6 top-32 mx-auto max-w-sm rounded-2xl bg-white/95 px-5 py-4 text-center shadow-2xl backdrop-blur"
           style={{ animation: "celebrate-pop 420ms ease-out" }}>
        <p className="text-[26px] leading-none">🎉</p>
        <p className="mt-2 text-[15px] font-extrabold text-slate-800">오늘 계획 완주!</p>
        <p className="mt-0.5 text-[12px] font-semibold text-slate-500">계획한 일을 모두 끝냈어요. 정말 잘하셨어요.</p>
      </div>
    </div>
  );
}

/* 태스크 캡처 시트 — 제목 입력 후 AI가 태그/분류 제안 */
export function TaskComposer({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("work");
  const [category, setCategory] = useState("today");
  const [repeat, setRepeat] = useState("none");
  const [days, setDays] = useState([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [classifying, setClassifying] = useState(false);
  const [suggested, setSuggested] = useState(false);

  const classify = async () => {
    if (!title.trim() || suggested) return;
    setClassifying(true);
    try {
      const r = await ai.classify(title.trim());
      if (r.type_tag) setTag(r.type_tag);
      if (r.category) setCategory(r.category);
      setSuggested(true);
    } catch { /* 실패해도 수동 선택으로 계속 진행 */ }
    setClassifying(false);
  };

  const toMin = (s) => { const [h, m] = s.split(":"); return Number(h) * 60 + Number(m); };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-slate-900/40" onClick={onClose}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-[17px] font-extrabold text-slate-800">새 태스크</h2>

        <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={classify}
               placeholder="예: 제안서 검토"
               className="mb-4 w-full rounded-xl bg-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500" />

        <label className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
          Type Tag {classifying && <Loader2 className="h-3 w-3 animate-spin" />}
          {suggested && !classifying && <span className="font-semibold normal-case text-blue-500">AI 제안 적용됨</span>}
        </label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TAG_KEYS.map((k) => (
            <button key={k} onClick={() => setTag(k)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${TAGS[k].chip} ${tag === k ? "ring-2 ring-slate-800" : "opacity-50"}`}>
              {TAGS[k].label}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Category</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCategory(c.key)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${category === c.key ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
              {c.label}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Repeat</label>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {REPEAT_OPTIONS.map((r) => (
            <button key={r.key} onClick={() => setRepeat(r.key)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${repeat === r.key ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {repeat === "custom_days" && (
          <div className="mb-3 flex gap-1.5">
            {DAY_LABELS.map((d, i) => (
              <button key={i} onClick={() => setDays((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}
                      className={`h-8 w-8 rounded-lg text-[11px] font-bold ${days.includes(i) ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                {d}
              </button>
            ))}
          </div>
        )}

        {repeat !== "none" && (
          <div className="mb-4 flex items-center gap-2">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                   className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] font-semibold" />
            <span className="text-slate-400">–</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                   className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] font-semibold" />
          </div>
        )}

        <button disabled={!title.trim()}
                onClick={() => onSave({
                  title: title.trim(), type_tag: tag, category, repeat_rule: repeat,
                  days_of_week: repeat === "custom_days" ? days : null,
                  fixed_start: repeat !== "none" ? toMin(start) : null,
                  fixed_end: repeat !== "none" ? toMin(end) : null,
                })}
                className="w-full rounded-xl bg-blue-500 py-3.5 text-[13px] font-bold text-white disabled:opacity-40">
          Save Task
        </button>
      </div>
    </div>
  );
}

/* 설정 시트 — 하루 최대 할 일 수(루틴 제외) */
/* 하루 계획이 기준치를 넘어설 때 한 번 물어보는 넛지 */
export function OverloadNudge({ count, limit, onClose, onOpenSettings }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-6" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <p className="text-[14.5px] font-extrabold text-slate-800">오늘 할 일이 벌써 {count}개예요</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
          루틴을 제외하고 하루 기준({limit}개)을 넘었어요.<br />
          무리한 계획은 아닌지 한번 살펴보세요.
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={onOpenSettings}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-[12px] font-bold text-slate-600">
            기준 조정
          </button>
          <button onClick={onClose}
                  className="flex-1 rounded-xl bg-blue-500 py-2.5 text-[12px] font-bold text-white">
            괜찮아요
          </button>
        </div>
      </div>
    </div>
  );
}
