import Timeline from "../components/Timeline";
import { Header, SectionTitle } from "../components/ui";

export default function TodayScreen({ data }) {
  const { tasks, entries, toggleDone, updateEntry } = data;

  const active = entries.filter((e) => !e.is_skipped);
  const doneCount = active.filter((e) => e.actual_duration != null).length;
  const total = active.length;

  const diffs = entries.map((e) => {
    const t = tasks.find((x) => x.id === e.task_id);
    if (!t) return null;
    if (e.is_skipped) return { title: t.title, label: "건너뜀 · 내일 이월", tone: "bg-slate-100 text-slate-600" };
    if (e.actual_duration == null) return null;
    const d = e.actual_duration - e.duration_minutes;
    if (d > 0) return { title: t.title, label: `+${d}m 초과`, tone: "bg-red-100 text-red-600" };
    if (d < 0) return { title: t.title, label: `${d}m 단축`, tone: "bg-sky-100 text-sky-700" };
    return null;
  }).filter(Boolean);

  return (
    <>
      <Header title="Today" sub="왼쪽 원을 체크해 완료 처리 · 빈 공간은 여유 시간" />

      <div className="mb-3 flex items-center gap-2">
        <span className="w-10 text-[11px] font-semibold text-slate-500">{doneCount} / {total}</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-500 transition-all"
               style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-16 text-center text-[12.5px] text-slate-400">
          오늘 배정된 일이 없어요.<br />Allocator에서 할 일을 시간에 배정해 보세요.
        </p>
      ) : (
        <Timeline mode="actual" entries={entries} tasks={tasks}
                  onUpdate={updateEntry} onToggleDone={toggleDone} />
      )}

      {diffs.length > 0 && (
        <>
          <SectionTitle>오늘 계획과 달라진 점</SectionTitle>
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            {diffs.map((d, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2 text-[13px] last:border-0">
                <span className="truncate pr-2">{d.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${d.tone}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
