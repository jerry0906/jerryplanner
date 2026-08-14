import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  DAY_END, DAY_START, DEFAULT_DUR, PX_PER_MIN, SNAP,
  TAGS, durLabel, fmt, minToY, yToMin,
} from "../lib/core";

/**
 * mode="plan"   → Allocator. 드래그로 배정/이동, 가장자리로 길이 조정. 계획만 보여준다.
 * mode="actual" → Today. 실제 소요 기준으로 그리고, 왼쪽 체크서클로 완료 처리.
 */
export default function Timeline({
  mode, entries, tasks, onAssign, onUpdate, onSelect, selectedId, dragHandle, onToggleDone,
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [, force] = useState(0);
  const height = minToY(DAY_END);
  const isActual = mode === "actual";

  const beginDrag = (payload) => { dragRef.current = payload; force((n) => n + 1); };

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d || !trackRef.current) return;
      e.preventDefault();
      const y = e.clientY - trackRef.current.getBoundingClientRect().top;

      if (d.kind === "new") {
        d.previewStart = yToMin(y - d.grabOffset);
        force((n) => n + 1);
      } else if (d.kind === "move") {
        onUpdate(d.entryId, { start_minute: yToMin(y - d.grabOffset) });
      } else if (d.kind === "resize-bottom") {
        onUpdate(d.entryId, { duration_minutes: Math.max(SNAP, yToMin(y) - d.start) });
      } else if (d.kind === "resize-top") {
        const start = Math.min(yToMin(y), d.end - SNAP);
        onUpdate(d.entryId, { start_minute: start, duration_minutes: d.end - start });
      }
    };
    const up = () => {
      const d = dragRef.current;
      if (d?.kind === "new" && d.previewStart != null) onAssign?.(d.taskId, d.previewStart);
      dragRef.current = null;
      force((n) => n + 1);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onAssign, onUpdate]);

  // Tasks 패널에서 드래그를 시작할 수 있도록 노출
  useEffect(() => { if (dragHandle) dragHandle.current = beginDrag; }, [dragHandle]);

  const hours = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);

  // Today 모드에서 빈 시간 구간 계산
  const gaps = [];
  if (isActual) {
    const busy = entries
      .filter((e) => !e.is_skipped)
      .map((e) => {
        const s = e.actual_start ?? e.start_minute;
        return { s, e: s + (e.actual_duration ?? e.duration_minutes) };
      })
      .sort((a, b) => a.s - b.s);
    let cursor = DAY_START;
    for (const b of busy) {
      if (b.s - cursor >= 30) gaps.push({ s: cursor, e: b.s });
      cursor = Math.max(cursor, b.e);
    }
    if (DAY_END - cursor >= 30) gaps.push({ s: cursor, e: DAY_END });
  }

  const drag = dragRef.current;

  return (
    <div className="flex select-none gap-1.5">
      {/* 시간 눈금 */}
      <div className="relative w-7 shrink-0" style={{ height }}>
        {hours.map((h) => (
          <span key={h} className="absolute -translate-y-1/2 text-[9px] font-semibold text-slate-400"
                style={{ top: minToY(h * 60) }}>
            {String(h).padStart(2, "0")}
          </span>
        ))}
      </div>

      {/* 완료 체크서클 (Today 전용) — 블록 높이와 무관하게 항상 같은 크기 */}
      {isActual && (
        <div className="relative w-6 shrink-0" style={{ height }}>
          {entries.filter((e) => !e.is_skipped).map((en) => {
            const start = en.actual_start ?? en.start_minute;
            const dur = en.actual_duration ?? en.duration_minutes;
            const done = en.actual_duration != null;
            return (
              <button key={en.id} onClick={() => onToggleDone?.(en.task_id)}
                      aria-label="완료 처리"
                      className={`absolute left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors ${
                        done ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                      }`}
                      style={{ top: minToY(start) + Math.max(14, dur * PX_PER_MIN) / 2 }}>
                {done && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
              </button>
            );
          })}
        </div>
      )}

      {/* 트랙 */}
      <div ref={trackRef} className="relative min-w-0 flex-1" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 border-t border-dashed border-slate-200"
               style={{ top: minToY(h * 60) }} />
        ))}

        {gaps.map((g, i) => (
          <div key={i}
               className="absolute inset-x-0 flex items-center justify-center rounded-md border border-dashed border-slate-200 px-1 text-center text-[9px] font-bold text-slate-400"
               style={{ top: minToY(g.s), height: minToY(g.e) - minToY(g.s) }}>
            {durLabel(g.e - g.s)} free
          </div>
        ))}

        {entries.map((en) => {
          const task = tasks.find((t) => t.id === en.task_id);
          if (!task) return null;

          const done = en.actual_duration != null;
          const start = isActual ? (en.actual_start ?? en.start_minute) : en.start_minute;
          const dur = isActual ? (en.actual_duration ?? en.duration_minutes) : en.duration_minutes;
          const delta = (en.actual_duration ?? en.duration_minutes) - en.duration_minutes;

          let cls = `${TAGS[task.type_tag]?.solid ?? "bg-slate-400"} text-white`;
          if (isActual && en.is_skipped) cls = "bg-slate-200 text-slate-500 line-through";
          else if (isActual && done) {
            cls = delta > 0 ? "bg-orange-500 text-white"
                : delta < 0 ? "bg-sky-400 text-white"
                : "bg-emerald-600 text-white";
          } else if (isActual) cls = "border border-dashed border-sky-400 bg-sky-100 text-sky-700";

          return (
            <div key={en.id}
                 onPointerDown={(e) => {
                   if (mode !== "plan") return;
                   const top = trackRef.current.getBoundingClientRect().top;
                   beginDrag({ kind: "move", entryId: en.id, grabOffset: e.clientY - top - minToY(start) });
                   onSelect?.(en.id);
                 }}
                 className={`absolute inset-x-0 overflow-hidden rounded-lg px-2 py-0.5 text-[10px] font-bold leading-tight ${cls} ${
                   mode === "plan" ? "cursor-grab touch-none active:cursor-grabbing" : ""
                 } ${selectedId === en.id ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
                 style={{ top: minToY(start), height: Math.max(14, dur * PX_PER_MIN) }}>
              {/* 계획 경계 — 실제가 계획과 다를 때만 */}
              {isActual && done && delta !== 0 && (
                <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-white/70"
                     style={{ top: en.duration_minutes * PX_PER_MIN }} />
              )}
              <div className="truncate">{task.title}</div>
              {dur >= 40 && (
                <div className="truncate text-[8.5px] font-semibold opacity-85">
                  {fmt(start)}–{fmt(start + dur)}
                  {isActual && done && delta !== 0 && ` (${delta > 0 ? "+" : ""}${delta}m)`}
                </div>
              )}

              {/* 리사이즈 그립 — Google/Outlook 캘린더 방식 */}
              {mode === "plan" && (
                <>
                  <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize"
                       onPointerDown={(e) => { e.stopPropagation(); beginDrag({ kind: "resize-top", entryId: en.id, end: start + dur }); }}>
                    <div className="mx-auto mt-0.5 h-1 w-7 rounded-full bg-white/80" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                       onPointerDown={(e) => { e.stopPropagation(); beginDrag({ kind: "resize-bottom", entryId: en.id, start }); }}>
                    <div className="mx-auto mt-0.5 h-1 w-7 rounded-full bg-white/80" />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* 드롭 프리뷰 */}
        {drag?.kind === "new" && drag.previewStart != null && (
          <div className="pointer-events-none absolute inset-x-0 rounded-lg border-2 border-dashed border-blue-500 bg-blue-100/80 px-2 py-0.5 text-[10px] font-bold text-blue-700"
               style={{ top: minToY(drag.previewStart), height: DEFAULT_DUR * PX_PER_MIN }}>
            {drag.title}
            <div className="text-[8.5px] opacity-80">
              {fmt(drag.previewStart)}–{fmt(drag.previewStart + DEFAULT_DUR)} · 기본 1시간
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
