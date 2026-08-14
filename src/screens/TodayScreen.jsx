import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Repeat } from "lucide-react";
import DayTimeline from "../components/DayTimeline";
import { DEFAULT_DUR, TAGS, timeToMin, todayISO, yToMin } from "../lib/core";

const shiftDate = (iso, days) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const label = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};

const repeatsOnDate = (task, iso) => {
  if (task.repeat_rule === "none") return false;
  const dow = new Date(iso + "T00:00:00").getDay();
  if (task.repeat_rule === "daily") return true;
  if (task.repeat_rule === "custom_days") return (task.days_of_week || []).includes(dow);
  if (task.repeat_rule === "weekly") return new Date(task.created_at).getDay() === dow;
  return false;
};

export default function TodayScreen({ data }) {
  const {
    tasks, entries, viewDate, setViewDate, loading,
    assign, updateEntry, unassign, toggleDone, moveToFollowup, backToTodo,
  } = data;

  const [drag, setDrag] = useState(null);   // 왼쪽 바 → 타임라인
  const [hoverBox, setHoverBox] = useState(null);
  const timelineApi = useRef(null);
  const todoBoxRef = useRef(null);
  const followBoxRef = useRef(null);

  const scheduledIds = new Set(entries.map((e) => e.task_id));

  const todoItems = tasks.filter(
    (t) => t.is_selected && t.status === "todo" && t.repeat_rule === "none" && !scheduledIds.has(t.id),
  );
  const followItems = tasks.filter((t) => t.status === "followup" && t.repeat_rule === "none");
  const routineTasks = tasks.filter((t) => t.repeat_rule !== "none" && repeatsOnDate(t, viewDate));

  const routines = routineTasks.map((t) => {
    const s = timeToMin(t.fixed_start_time) ?? 9 * 60;
    const e = timeToMin(t.fixed_end_time) ?? s + 30;
    return { id: t.id, title: t.title, start: s, duration: Math.max(15, e - s) };
  });

  /* 왼쪽 바에서 타임라인으로 끌어놓기 */
  useEffect(() => {
    if (!drag) return;
    const move = (e) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e) => {
      const track = timelineApi.current?.getTrack?.();
      if (track) {
        const r = track.getBoundingClientRect();
        if (e.clientX > r.left - 4 && e.clientY > r.top && e.clientY < r.bottom) {
          assign(drag.taskId, yToMin(e.clientY - r.top - 10), DEFAULT_DUR);
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, assign]);

  /* 타임라인 블록을 왼쪽으로 끌어냈을 때: 어느 박스에 놓았는지로 처리 분기 */
  const handleBlockDragOut = (entryId, x, y) => {
    const inBox = (ref) => {
      const el = ref.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
    };
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    if (inBox(followBoxRef)) moveToFollowup(entry.task_id);
    else unassign(entryId);   // To-do 박스든 그 밖이든, 배정만 해제하면 To-do로 돌아간다
    setHoverBox(null);
  };

  const dragged = drag ? tasks.find((t) => t.id === drag.taskId) : null;

  return (
    <>
      {/* 날짜 이동 */}
      <div className="mb-3 flex items-center justify-between pt-1">
        <button onClick={() => setViewDate(shiftDate(viewDate, -1))}
                aria-label="전날" className="rounded-lg p-2 text-slate-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[16px] font-extrabold text-slate-800">{label(viewDate)}</p>
          {viewDate !== todayISO() && (
            <button onClick={() => setViewDate(todayISO())}
                    className="text-[10.5px] font-bold text-blue-500">오늘로</button>
          )}
        </div>
        <button onClick={() => setViewDate(shiftDate(viewDate, 1))}
                aria-label="다음날" className="rounded-lg p-2 text-slate-400">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
      ) : (
        <div className="flex gap-2">
          {/* 왼쪽 바 */}
          <div className="w-[38%] shrink-0 space-y-3">
            <Box label="To-do" innerRef={todoBoxRef} tone="blue" count={todoItems.length}>
              {todoItems.length === 0 && <Empty text="Tasks에서 오늘 할 일을 골라보세요" />}
              {todoItems.map((t) => (
                <Chip key={t.id} task={t} draggable
                      onGrab={(e) => { e.preventDefault(); setDrag({ taskId: t.id, x: e.clientX, y: e.clientY }); }} />
              ))}
            </Box>

            <Box label="Follow-up" innerRef={followBoxRef} tone="violet" count={followItems.length}>
              {followItems.length === 0 && <Empty text="타임라인에서 여기로 끌어놓으면 팔로우업" />}
              {followItems.map((t) => (
                <Chip key={t.id} task={t} onClick={() => backToTodo(t.id)} />
              ))}
            </Box>

            <Box label="Routine" tone="slate" count={routineTasks.length}>
              {routineTasks.length === 0 && <Empty text="반복 일정 없음" />}
              {routineTasks.map((t) => (
                <div key={t.id} className="mb-1 flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-[10.5px] font-semibold text-slate-500">
                  <Repeat className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{t.title}</span>
                </div>
              ))}
            </Box>
          </div>

          {/* 타임라인 */}
          <div className="min-w-0 flex-1">
            <DayTimeline entries={entries} tasks={tasks} routines={routines}
                         dragApi={timelineApi}
                         onUpdate={updateEntry} onToggleDone={toggleDone}
                         onBlockDragOut={handleBlockDragOut} />
          </div>
        </div>
      )}

      {/* 드래그 중인 카드 미리보기 */}
      {dragged && drag && (
        <div className="pointer-events-none fixed z-30 w-[150px] -translate-x-1/2 -translate-y-1/2 rotate-2 rounded-xl bg-white px-2.5 py-2 shadow-2xl ring-2 ring-blue-400"
             style={{ left: drag.x, top: drag.y }}>
          <p className="truncate text-[11.5px] font-semibold text-slate-800">{dragged.title}</p>
        </div>
      )}
    </>
  );
}

const TONES = {
  blue: "border-blue-200 bg-blue-50/50",
  violet: "border-violet-200 bg-violet-50/50",
  slate: "border-slate-200 bg-slate-50/50",
};

function Box({ label, count, tone, innerRef, children }) {
  return (
    <div ref={innerRef} className={`rounded-xl border p-2 ${TONES[tone]}`}>
      <p className="mb-1.5 flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wide text-slate-500">
        {label}<span className="text-slate-300">{count}</span>
      </p>
      {children}
    </div>
  );
}

const Empty = ({ text }) => (
  <p className="py-1 text-center text-[9.5px] leading-tight text-slate-300">{text}</p>
);

function Chip({ task, draggable, onGrab, onClick }) {
  return (
    <div onPointerDown={draggable ? onGrab : undefined}
         onClick={onClick}
         className={`mb-1 rounded-lg bg-white px-2 py-1.5 shadow-sm ${
           draggable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}`}>
      <span className={`mb-0.5 inline-block rounded-full px-1.5 py-px text-[8px] font-bold ${TAGS[task.type_tag]?.chip}`}>
        {TAGS[task.type_tag]?.label}
      </span>
      <p className="text-[11px] font-semibold leading-tight text-slate-800">{task.title}</p>
    </div>
  );
}
