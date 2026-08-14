import { useRef, useState } from "react";
import { Check, Cloud, Loader2, Trash2 } from "lucide-react";
import Timeline from "../components/Timeline";
import { Header } from "../components/ui";
import { useDayPlan } from "../hooks/useDayPlan";
import { TAGS, durLabel, todayISO } from "../lib/core";
import { outlook } from "../lib/supabase";

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AllocatorScreen({ data, userId }) {
  const [targetDate, setTargetDate] = useState(tomorrowISO()); // 저녁 계획은 보통 "내일"을 짠다
  const isToday = targetDate === todayISO();
  const day = useDayPlan(userId, targetDate, data.tasks);

  const [selected, setSelected] = useState(null);
  const [pushState, setPushState] = useState("idle"); // idle | pushing | done | error
  const [pushMsg, setPushMsg] = useState(null);
  const dragHandle = useRef(null);

  const assignedIds = new Set(day.entries.map((e) => e.task_id));
  const unassigned = data.tasks.filter(
    (t) => !assignedIds.has(t.id) && t.category !== "later" && !t.is_done,
  );

  const selectedEntry = day.entries.find((e) => e.id === selected);
  const selectedTask = data.tasks.find((t) => t.id === selectedEntry?.task_id);

  const saveAndPush = async () => {
    setPushState("pushing"); setPushMsg(null);
    try {
      const r = await outlook.push(targetDate);
      setPushState("done");
      setPushMsg(r.error ?? `${r.pushed}건 Outlook에 반영됐어요.`);
    } catch (e) {
      setPushState("error");
      setPushMsg(String(e.message ?? e));
    }
    setTimeout(() => setPushState("idle"), 3000);
  };

  return (
    <>
      <Header title="Allocator" sub="Tasks를 타임라인으로 끌어놓으면 기본 1시간 · 가장자리로 길이 조정" />

      <div className="mb-3 flex gap-1.5 rounded-xl bg-slate-100 p-1">
        {[{ key: tomorrowISO(), label: "내일 계획" }, { key: todayISO(), label: "오늘" }].map((d) => (
          <button key={d.key} onClick={() => setTargetDate(d.key)}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-bold transition-colors ${
                    targetDate === d.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>
            {d.label}
          </button>
        ))}
      </div>

      {day.loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
      ) : (
        <div className="flex gap-2">
          <div className="w-[34%] shrink-0">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Tasks</p>
            {unassigned.length === 0 && <p className="text-[11px] text-slate-400">배정할 일이 없어요</p>}
            {unassigned.map((t) => (
              <div key={t.id}
                   onPointerDown={() => dragHandle.current?.({
                     kind: "new", taskId: t.id, title: t.title, grabOffset: 14, previewStart: null,
                   })}
                   className={`mb-2 cursor-grab touch-none rounded-xl border-l-4 bg-white px-2 py-2 shadow-sm active:cursor-grabbing ${TAGS[t.type_tag]?.border}`}>
                <span className={`mb-1 inline-block rounded-full px-1.5 py-px text-[8.5px] font-bold ${TAGS[t.type_tag]?.chip}`}>
                  {TAGS[t.type_tag]?.label}
                </span>
                <div className="text-[11.5px] font-semibold leading-tight text-slate-800">{t.title}</div>
              </div>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Plan · {isToday ? "오늘" : "내일"}
            </p>
            <Timeline mode="plan" entries={day.entries} tasks={data.tasks} dragHandle={dragHandle}
                      onAssign={day.assign} onUpdate={day.updateEntry}
                      onSelect={setSelected} selectedId={selected} />
          </div>
        </div>
      )}

      {selectedEntry && (
        <div className="sticky bottom-2 mt-3 flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg">
          <div className="min-w-0 pr-3">
            <p className="truncate text-[11.5px] font-semibold">{selectedTask?.title}</p>
            <p className="text-[10px] opacity-70">{durLabel(selectedEntry.duration_minutes)} 배정됨</p>
          </div>
          <button onClick={() => { day.unassign(selectedEntry.id); setSelected(null); }}
                  className="shrink-0 rounded-lg bg-white/15 p-2" aria-label="배정 해제">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <button onClick={saveAndPush} disabled={pushState === "pushing" || day.entries.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3.5 text-[12.5px] font-bold text-white disabled:opacity-40">
        {pushState === "pushing" ? <Loader2 className="h-4 w-4 animate-spin" />
          : pushState === "done" ? <Check className="h-4 w-4" />
          : <Cloud className="h-4 w-4" />}
        저장 & Outlook으로 전송
      </button>
      {pushMsg && (
        <p className={`mt-2 text-center text-[11px] font-semibold ${pushState === "error" ? "text-rose-500" : "text-slate-400"}`}>
          {pushMsg}
        </p>
      )}
    </>
  );
}
