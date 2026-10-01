import { Check, GripVertical, Pencil, Repeat, Trash2 } from "lucide-react";
import { Header } from "../components/ui";
import { TAGS } from "../lib/core";
import { holdThenDrag } from "../lib/holdThenDrag";
import { useDragOrder } from "../hooks/useDragOrder";

/**
 * 할 일의 원본 목록.
 *  - 세로로 끌어 우선순위 변경
 *  - 오른쪽 체크박스 = 오늘 할 일로 선정 (Today 화면 왼쪽 바에 나타남)
 *  - 완료 버튼은 없다. 완료 처리는 Today 타임라인에서만 한다.
 *  - 일반 / 팔로우업 / 루틴 세 섹션으로 나눠 보여준다.
 *    (루틴 = 반복 항목, 팔로우업 = status가 followup인 비반복 항목)
 */
export default function TasksScreen({ data, onCompose, onEdit }) {
  const { tasks, ltgs, toggleSelected, reorderTasks, deleteTask } = data;

  const notDone = tasks.filter((t) => t.status !== "done");

  const bySortOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

  const regularTasks = notDone
    .filter((t) => t.repeat_rule === "none" && t.status !== "followup")
    .sort(bySortOrder);

  const followupTasks = notDone
    .filter((t) => t.repeat_rule === "none" && t.status === "followup")
    .sort(bySortOrder);

  const routineTasks = notDone
    .filter((t) => t.repeat_rule !== "none")
    .sort(bySortOrder);

  const regular = useDragOrder(regularTasks, reorderTasks);
  const followup = useDragOrder(followupTasks, reorderTasks);
  const routine = useDragOrder(routineTasks, reorderTasks);

  const selectedCount = notDone.filter((t) => t.is_selected).length;

  const renderRow = (t, group) => {
    const ltg = t.ltg_id ? ltgs.find((g) => g.id === t.ltg_id) : null;
    const isRoutine = t.repeat_rule !== "none";
    return (
      <div key={t.id} ref={(el) => (group.rowRefs.current[t.id] = el)}
           className={`mb-1.5 flex items-center gap-2 rounded-xl bg-white py-2 pl-1 pr-2 shadow-sm transition-[opacity,transform] duration-150 ease-out ${
             group.dragId === t.id ? "scale-[1.02] opacity-50 ring-2 ring-blue-400" : ""}`}>
        <button onPointerDown={(e) => { e.preventDefault(); holdThenDrag(e, () => group.setDragId(t.id)); }}
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
          {isRoutine && (
            <span className="flex items-center gap-0.5 text-[9.5px] font-bold text-slate-400">
              <Repeat className="h-2.5 w-2.5" />
              {t.repeat_rule === "daily" ? "매일" : t.repeat_rule === "weekly" ? "매주" : "요일 지정"}
            </span>
          )}
        </div>

        <button onClick={() => deleteTask(t.id)} aria-label="삭제"
                className="shrink-0 p-1 text-slate-200 hover:text-rose-400">
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {isRoutine || group === followup ? (
          // 루틴과 팔로우업은 선정하지 않아도 Today에 항상 표시된다
          <div className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-300"
               title={isRoutine ? "루틴은 항상 Today에 표시돼요" : "팔로우업은 항상 Today에 표시돼요"}>
            {isRoutine && <Repeat className="h-3.5 w-3.5" />}
          </div>
        ) : (
          <button onClick={() => toggleSelected(t.id)}
                  aria-label="오늘 할 일로 선정"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    t.is_selected ? "border-blue-500 bg-blue-500" : "border-slate-200"}`}>
            {t.is_selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <Header title="Tasks" sub={`전체 ${notDone.length}개 · 오늘 선정 ${selectedCount}개`} />

      <p className="mb-3 text-[11px] text-slate-400">
        손잡이를 지그시 눌러 우선순위를 바꾸고, 오른쪽 체크로 오늘 할 일을 고르세요.
      </p>

      {notDone.length === 0 && (
        <p className="py-16 text-center text-[12.5px] text-slate-400">
          할 일이 없어요.<br />오른쪽 아래 버튼으로 추가해 보세요.
        </p>
      )}

      {notDone.length > 0 && (
        <>
          <Section label="일반" count={regular.list.length} first />
          {regular.list.length === 0 && <p className="py-2 text-center text-[11px] text-slate-300">일반 할 일 없음</p>}
          {regular.list.map((t) => renderRow(t, regular))}
        </>
      )}

      {followup.list.length > 0 && (
        <>
          <Section label="팔로우업" count={followup.list.length} tone="text-violet-500" />
          {followup.list.map((t) => renderRow(t, followup))}
        </>
      )}

      {routine.list.length > 0 && (
        <>
          <Section label="루틴" count={routine.list.length} />
          {routine.list.map((t) => renderRow(t, routine))}
        </>
      )}

      <button onClick={onCompose} aria-label="할 일 추가"
              className="fixed bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl shadow-blue-500/40">
        <Pencil className="h-5 w-5" />
      </button>
    </>
  );
}

function Section({ label, count, tone = "text-slate-400", first }) {
  return (
    <div className={`mb-1.5 flex items-center gap-2 ${first ? "" : "mt-4"}`}>
      <span className={`text-[10.5px] font-bold ${tone}`}>{label}</span>
      <span className="text-[10px] text-slate-300">{count}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
