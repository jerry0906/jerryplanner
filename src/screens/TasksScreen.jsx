import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, Pencil, Trash2 } from "lucide-react";
import { Header } from "../components/ui";
import { TAGS } from "../lib/core";
import { holdThenDrag } from "../lib/holdThenDrag";

/**
 * 할 일의 원본 목록.
 *  - 세로로 끌어 우선순위 변경
 *  - 오른쪽 체크박스 = 오늘 할 일로 선정 (Today 화면 왼쪽 바에 나타남)
 *  - 완료 버튼은 없다. 완료 처리는 Today 타임라인에서만 한다.
 */
export default function TasksScreen({ data, onCompose, onEdit }) {
  const { tasks, ltgs, toggleSelected, reorderTasks, deleteTask } = data;

  const visible = tasks
    .filter((t) => t.status !== "done" && t.repeat_rule === "none")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const [order, setOrder] = useState(null);      // 드래그 중 임시 순서
  const [dragId, setDragId] = useState(null);
  const rowRefs = useRef({});

  const list = order ?? visible;

  useEffect(() => {
    if (!dragId) return;
    const move = (e) => {
      const ids = (order ?? visible).map((t) => t.id);
      const from = ids.indexOf(dragId);
      let to = from;
      for (let i = 0; i < ids.length; i++) {
        const el = rowRefs.current[ids[i]];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (e.clientY > r.top && e.clientY < r.bottom) { to = i; break; }
      }
      if (to !== from) {
        const next = [...(order ?? visible)];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setOrder(next);
      }
    };
    const up = () => {
      if (order) reorderTasks(order.map((t) => t.id));
      setDragId(null);
      setOrder(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragId, order, visible, reorderTasks]);

  const selectedCount = visible.filter((t) => t.is_selected).length;

  return (
    <>
      <Header title="Tasks" sub={`전체 ${visible.length}개 · 오늘 선정 ${selectedCount}개`} />

      <p className="mb-3 text-[11px] text-slate-400">
        손잡이를 지그시 눌러 우선순위를 바꾸고, 오른쪽 체크로 오늘 할 일을 고르세요.
      </p>

      {list.length === 0 && (
        <p className="py-16 text-center text-[12.5px] text-slate-400">
          할 일이 없어요.<br />오른쪽 아래 버튼으로 추가해 보세요.
        </p>
      )}

      {list.map((t) => {
        const ltg = t.ltg_id ? ltgs.find((g) => g.id === t.ltg_id) : null;
        const isFollowup = t.status === "followup";
        return (
          <div key={t.id} ref={(el) => (rowRefs.current[t.id] = el)}
               className={`mb-1.5 flex items-center gap-2 rounded-xl bg-white py-2 pl-1 pr-2 shadow-sm transition-[opacity,transform] duration-150 ease-out ${
                 dragId === t.id ? "scale-[1.02] opacity-50 ring-2 ring-blue-400" : ""}`}>
            <button onPointerDown={(e) => { e.preventDefault(); holdThenDrag(e, () => setDragId(t.id)); }}
                    aria-label="순서 변경"
                    className="shrink-0 cursor-grab touch-none px-1 text-slate-300 active:cursor-grabbing">
              <GripVertical className="h-4 w-4" />
            </button>

            <div onClick={() => onEdit(t)} className="flex w-16 shrink-0 cursor-pointer justify-center">
              <span className={`truncate rounded-full px-2 py-0.5 text-[9px] font-bold ${TAGS[t.type_tag]?.chip}`}>
                {TAGS[t.type_tag]?.label}
              </span>
            </div>

            <div onClick={() => onEdit(t)} className="min-w-0 flex-1 cursor-pointer">
              <p className="truncate text-[13.5px] font-semibold text-slate-800">
                {ltg && <span className="font-medium text-slate-400">{ltg.title} <span className="text-slate-300">›</span> </span>}
                {t.title}
              </p>
              {isFollowup && (
                <span className="text-[9.5px] font-bold text-violet-500">팔로우업</span>
              )}
            </div>

            <button onClick={() => deleteTask(t.id)} aria-label="삭제"
                    className="shrink-0 p-1 text-slate-200 hover:text-rose-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            <button onClick={() => toggleSelected(t.id)}
                    aria-label="오늘 할 일로 선정"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      t.is_selected ? "border-blue-500 bg-blue-500" : "border-slate-200"}`}>
              {t.is_selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </button>
          </div>
        );
      })}

      <button onClick={onCompose} aria-label="할 일 추가"
              className="fixed bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl shadow-blue-500/40">
        <Pencil className="h-5 w-5" />
      </button>
    </>
  );
}
