import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  DAY_END, DAY_START, PX_PER_MIN, SNAP, TAGS, durLabel, fmt, minToY, yToMin,
} from "../lib/core";

/**
 * 하루 타임라인.
 *  - 루틴은 entry 없이도 흐린 배경 블록으로 항상 표시된다.
 *  - 배정된 항목은 블록을 끌어 시간 이동, 가장자리로 길이 조정.
 *  - 블록을 왼쪽 바 밖으로 끌어내면 배정이 해제된다(드롭 판정은 부모가 함).
 */
export default function DayTimeline({
  entries, tasks, routines, dragApi,
  onUpdate, onToggleDone, onBlockDragOut,
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [, force] = useState(0);
  const height = minToY(DAY_END);

  const begin = (payload) => { dragRef.current = payload; force((n) => n + 1); };

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d || !trackRef.current) return;
      e.preventDefault();
      const rect = trackRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const outsideLeft = e.clientX < rect.left - 8;

      if (d.kind === "move") {
        d.escaped = outsideLeft;
        if (!outsideLeft) onUpdate(d.entryId, { start_minute: yToMin(y - d.grabOffset) });
        force((n) => n + 1);
      } else if (d.kind === "resize-bottom") {
        onUpdate(d.entryId, { duration_minutes: Math.max(SNAP, yToMin(y) - d.start) });
      } else if (d.kind === "resize-top") {
        const start = Math.min(yToMin(y), d.end - SNAP);
        onUpdate(d.entryId, { start_minute: start, duration_minutes: d.end - start });
      }
    };
    const up = (e) => {
      const d = dragRef.current;
      if (d?.kind === "move" && d.escaped) onBlockDragOut?.(d.entryId, e.clientX, e.clientY);
      dragRef.current = null;
      force((n) => n + 1);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onUpdate, onBlockDragOut]);

  // 왼쪽 바에서 끌어온 항목의 드롭 위치를 부모가 계산할 수 있게 트랙 정보를 넘겨준다
  useEffect(() => {
    if (dragApi) dragApi.current = { getTrack: () => trackRef.current };
  }, [dragApi]);

  const hours = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);

  const drag = dragRef.current;

  return (
    <div className="flex select-none gap-1">
      <div className="relative w-6 shrink-0" style={{ height }}>
        {hours.map((h) => (
          <span key={h} className="absolute -translate-y-1/2 text-[9px] font-semibold text-slate-400"
                style={{ top: minToY(h * 60) }}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>

      <div ref={trackRef} className="relative min-w-0 flex-1" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 border-t border-dashed border-slate-200"
               style={{ top: minToY(h * 60) }} />
        ))}

        {/* 루틴 — 흐린 배경으로 항상 표시 */}
        {routines.map((r) => (
          <div key={`routine-${r.id}`}
               className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-400"
               style={{ top: minToY(r.start), height: Math.max(12, r.duration * PX_PER_MIN) }}>
            {r.title}
          </div>
        ))}

        {/* 배정된 항목 */}
        {entries.map((en) => {
          const task = tasks.find((t) => t.id === en.task_id);
          if (!task) return null;
          const done = en.actual_duration != null;
          const start = en.start_minute;
          const dur = en.duration_minutes;
          const dragging = drag?.kind === "move" && drag.entryId === en.id;

          return (
            <div key={en.id}
                 onPointerDown={(e) => {
                   const top = trackRef.current.getBoundingClientRect().top;
                   begin({ kind: "move", entryId: en.id, taskId: en.task_id,
                           grabOffset: e.clientY - top - minToY(start), escaped: false });
                 }}
                 className={`absolute inset-x-0 cursor-grab touch-none overflow-hidden rounded-lg px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white active:cursor-grabbing ${
                   done ? "bg-emerald-600" : TAGS[task.type_tag]?.solid ?? "bg-slate-400"
                 } ${dragging && drag.escaped ? "opacity-40 ring-2 ring-rose-400" : ""}`}
                 style={{ top: minToY(start), height: Math.max(16, dur * PX_PER_MIN) }}>
              <div className="flex items-start gap-1">
                <button onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onToggleDone(en.task_id)}
                        aria-label="완료"
                        className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                          done ? "border-white bg-white" : "border-white/70"}`}>
                  {done && <Check className="h-2.5 w-2.5 text-emerald-600" strokeWidth={4} />}
                </button>
                <span className={`truncate ${done ? "line-through opacity-80" : ""}`}>{task.title}</span>
              </div>
              {dur >= 40 && (
                <div className="truncate pl-4 text-[8.5px] font-semibold opacity-85">
                  {fmt(start)}–{fmt(start + dur)} · {durLabel(dur)}
                </div>
              )}

              <div className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                   onPointerDown={(e) => { e.stopPropagation(); begin({ kind: "resize-top", entryId: en.id, end: start + dur }); }} />
              <div className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                   onPointerDown={(e) => { e.stopPropagation(); begin({ kind: "resize-bottom", entryId: en.id, start }); }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
