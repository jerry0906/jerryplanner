import { Header, SectionTitle } from "../components/ui";
import { TAGS, TAG_KEYS, durLabel } from "../lib/core";

export default function StatsScreen({ data }) {
  const { tasks, entries } = data;

  const active = entries.filter((e) => !e.is_skipped);
  const done = active.filter((e) => e.actual_duration != null);
  const rate = active.length ? Math.round((done.length / active.length) * 100) : 0;

  const tagMinutes = {};
  done.forEach((e) => {
    const t = tasks.find((x) => x.id === e.task_id);
    if (t) tagMinutes[t.type_tag] = (tagMinutes[t.type_tag] || 0) + e.actual_duration;
  });
  const total = Object.values(tagMinutes).reduce((a, b) => a + b, 0);

  const drifts = done
    .map((e) => {
      const t = tasks.find((x) => x.id === e.task_id);
      const d = e.actual_duration - e.duration_minutes;
      return t && d !== 0 ? { title: t.title, d } : null;
    })
    .filter(Boolean);

  const avgDrift = done.length
    ? Math.round(done.reduce((a, e) => a + ((e.actual_duration - e.duration_minutes) / e.duration_minutes) * 100, 0) / done.length)
    : 0;

  return (
    <>
      <Header title="Stats" sub="오늘 기준 · 데이터가 쌓이면 주간으로 확장됩니다" />

      <SectionTitle>① 완수율</SectionTitle>
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-3xl font-extrabold text-slate-800">{rate}%</p>
        <p className="text-[11.5px] text-slate-400">{done.length} / {active.length}개 완료</p>
      </div>

      <SectionTitle>② 태그별 시간 비중</SectionTitle>
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {total === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">아직 완료된 일이 없어요</p>
        ) : (
          <>
            <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100">
              {TAG_KEYS.filter((k) => tagMinutes[k]).map((k) => (
                <div key={k} className={TAGS[k].solid}
                     style={{ width: `${(tagMinutes[k] / total) * 100}%` }}
                     title={`${TAGS[k].label} ${durLabel(tagMinutes[k])}`} />
              ))}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2">
              {TAG_KEYS.filter((k) => tagMinutes[k]).map((k) => (
                <div key={k} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`h-2.5 w-2.5 rounded-full ${TAGS[k].solid}`} />
                  <span className="font-semibold text-slate-600">{TAGS[k].label}</span>
                  <span className="font-bold text-slate-400">{Math.round((tagMinutes[k] / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <SectionTitle>③ 시간 추정 정확도</SectionTitle>
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {done.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">완료된 일이 쌓이면 표시됩니다</p>
        ) : (
          <>
            <p className="text-[22px] font-extrabold text-slate-800">
              평균 {avgDrift > 0 ? "+" : ""}{avgDrift}%
            </p>
            <p className="mb-2 text-[11.5px] text-slate-400">
              계획 대비 실제 소요시간 {avgDrift > 0 ? "(초과 경향)" : avgDrift < 0 ? "(단축 경향)" : "(정확)"}
            </p>
            {drifts.map((d, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2 text-[13px] last:border-0">
                <span className="truncate pr-2">{d.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  d.d > 0 ? "bg-red-100 text-red-600" : "bg-sky-100 text-sky-700"}`}>
                  {d.d > 0 ? "+" : ""}{d.d}m
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
