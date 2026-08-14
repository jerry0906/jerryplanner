import { useEffect, useRef, useState } from "react";
import { Header, SectionTitle, TaskCard } from "../components/ui";
import { CATEGORIES, TAGS } from "../lib/core";

export default function TasksScreen({ data }) {
  const { tasks, entries, ltgs, moveTaskCategory, toggleDone } = data;
  const [dragId, setDragId] = useState(null);
  const [pos, setPos] = useState(null);
  const catRefs = useRef({});
  const hoverRef = useRef(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (!dragId) return;
    const move = (e) => {
      setPos({ x: e.clientX, y: e.clientY });
      let found = null;
      for (const c of CATEGORIES) {
        const el = catRefs.current[c.key];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12) { found = c.key; break; }
      }
      if (hoverRef.current !== found) { hoverRef.current = found; force((n) => n + 1); }
    };
    const up = () => {
      if (hoverRef.current) moveTaskCategory(dragId, hoverRef.current);
      hoverRef.current = null;
      setDragId(null);
      setPos(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragId, moveTaskCategory]);

  const isTaskDone = (t) => {
    const entry = entries.find((e) => e.task_id === t.id);
    return entry ? entry.actual_duration != null : !!t.is_done;
  };

  const dragged = tasks.find((t) => t.id === dragId);

  return (
    <>
      <Header title="Tasks" sub="카드를 끌어 카테고리 이동 · 왼쪽 원을 눌러 완료 처리" />

      {CATEGORIES.map((c) => {
        const items = tasks.filter((t) => t.category === c.key);
        const isTarget = dragId && hoverRef.current === c.key;
        return (
          <div key={c.key} ref={(el) => (catRefs.current[c.key] = el)}
               className={`rounded-2xl p-1.5 transition-colors ${isTarget ? "bg-blue-50 ring-2 ring-blue-300" : ""}`}>
            <SectionTitle>{c.label}</SectionTitle>
            {items.length === 0 && (
              <p className="pb-3 text-center text-[11px] font-medium text-slate-300">
                {isTarget ? "여기에 놓기" : "비어있음"}
              </p>
            )}
            {items.map((t) => (
              <TaskCard key={t.id} task={t}
                        ltg={t.ltg_id ? ltgs.find((g) => g.id === t.ltg_id) : null}
                        done={isTaskDone(t)}
                        dragging={dragId === t.id}
                        onGrab={(e) => { e.preventDefault(); setDragId(t.id); setPos({ x: e.clientX, y: e.clientY }); }}
                        onToggle={() => toggleDone(t.id)} />
            ))}
          </div>
        );
      })}

      {dragged && pos && (
        <div className="pointer-events-none fixed z-30 w-[260px] -translate-x-1/2 -translate-y-1/2 rotate-2 rounded-2xl bg-white px-4 py-3 shadow-2xl ring-2 ring-blue-400"
             style={{ left: pos.x, top: pos.y }}>
          <p className="truncate text-[13.5px] font-semibold text-slate-800">{dragged.title}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${TAGS[dragged.type_tag]?.chip}`}>
            {TAGS[dragged.type_tag]?.label}
          </span>
        </div>
      )}
    </>
  );
}
