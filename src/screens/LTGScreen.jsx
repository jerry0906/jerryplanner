import { useEffect, useState } from "react";
import { Check, ChevronLeft, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Header, SectionTitle, Spinner } from "../components/ui";
import { TAGS } from "../lib/core";
import { ai } from "../lib/supabase";

export default function LTGScreen({ data }) {
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);

  if (open) {
    const ltg = data.ltgs.find((g) => g.id === open);
    if (!ltg) { setOpen(null); return null; }
    return <LTGDetail ltg={ltg} data={data} onBack={() => setOpen(null)} />;
  }

  return (
    <>
      <Header title="LTG" sub={`Long Term Goals · ${data.ltgs.length}개`} />

      {data.ltgs.length === 0 && !creating && (
        <p className="py-12 text-center text-[12.5px] text-slate-400">
          아직 장기 목표가 없어요.<br />목표를 만들면 AI가 하위 과업을 제안해 드려요.
        </p>
      )}

      {data.ltgs.map((g) => {
        const subs = data.tasks.filter((t) => t.ltg_id === g.id);
        const done = subs.filter((t) => t.is_done).length;
        const pct = subs.length ? (done / subs.length) * 100 : 0;
        return (
          <button key={g.id} onClick={() => setOpen(g.id)}
                  className={`mb-3 w-full rounded-2xl p-4 text-left shadow-sm ${
                    subs.length ? "bg-white" : "border-2 border-dashed border-slate-200 bg-white/60"}`}>
            <p className="text-[15px] font-bold text-slate-800">{g.title}</p>
            <p className="mb-2 mt-1 text-[11.5px] text-slate-400">
              달성 목표일 {g.due_date} · {subs.length ? `하위 과업 ${done}/${subs.length}` : "하위 과업 없음 · 탭하면 AI Breakdown"}
            </p>
            {subs.length > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            )}
          </button>
        );
      })}

      {creating ? (
        <NewLTGForm onCancel={() => setCreating(false)}
                    onCreate={async (title, due, outcome) => {
                      const g = await data.addLTG(title, due, outcome);
                      setCreating(false);
                      if (g) setOpen(g.id);
                    }} />
      ) : (
        <button onClick={() => setCreating(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-3 text-[12px] font-bold text-slate-500">
          <Plus className="h-4 w-4" /> New LTG
        </button>
      )}
    </>
  );
}

function NewLTGForm({ onCreate, onCancel }) {
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [due, setDue] = useState("");
  const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-wide text-slate-400";
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <SectionTitle>새 장기 목표</SectionTitle>

      <label className={labelCls}>목표</label>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 자격증 취득"
             className="mb-3 w-full rounded-xl bg-slate-100 px-4 py-3 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-blue-500" />

      <label className={labelCls}>달성하고자 하는 최종 상태</label>
      <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3}
                placeholder="예: 필기·실기 모두 합격해 자격증을 손에 쥔 상태. 주 3회 이상 공부 습관이 자리잡음."
                className="mb-1 w-full resize-none rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-medium leading-relaxed outline-none focus:ring-2 focus:ring-blue-500" />
      <p className="mb-3 text-[10.5px] text-slate-400">AI가 이 설명을 참고해 하위 과업을 쪼갭니다.</p>

      <label className={labelCls}>달성 목표일</label>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
             className="mb-3 w-full rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-blue-500" />

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl bg-slate-100 py-3 text-[12.5px] font-bold text-slate-500">취소</button>
        <button disabled={!title.trim() || !due} onClick={() => onCreate(title.trim(), due, outcome.trim())}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-[12.5px] font-bold text-white disabled:opacity-40">
          만들기
        </button>
      </div>
    </div>
  );
}

function LTGDetail({ ltg, data, onBack }) {
  const subs = data.tasks.filter((t) => t.ltg_id === ltg.id);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await ai.breakdown(ltg.title, ltg.due_date, subs.map((s) => s.title), ltg.outcome);
      setDraft(r.subtasks.map((s, i) => ({ ...s, key: i, keep: true })));
    } catch (e) {
      setErr(String(e.message ?? e).includes("Failed to fetch")
        ? "AI 기능이 아직 서버에 배포되지 않았어요. (supabase functions deploy ai)"
        : `제안을 불러오지 못했어요: ${e.message ?? e}`);
    }
    setLoading(false);
  };

  // 하위 과업이 하나도 없을 때만 자동으로 초안을 띄운다
  useEffect(() => { if (subs.length === 0 && !draft && !err) run(); }, []);

  const confirm = async () => {
    await data.addTasks(
      draft.filter((d) => d.keep).map((d) => ({ title: d.title, ltg_id: ltg.id })),
    );
    setDraft(null);
  };

  return (
    <>
      <button onClick={onBack} className="mb-1 mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-slate-400">
        <ChevronLeft className="h-3.5 w-3.5" /> LTG
      </button>
      <Header title={ltg.title} sub={`달성 목표일 ${ltg.due_date}`}
              right={
                <button onClick={() => { data.deleteLTG(ltg.id); onBack(); }}
                        className="rounded-lg bg-slate-100 p-2 text-slate-400" aria-label="목표 삭제">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              } />

      {subs.length > 0 ? (
        <>
          <SectionTitle>Subtasks</SectionTitle>
          {subs.map((t) => (
            <div key={t.id} className="mb-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <button onClick={() => data.toggleDone(t.id)} aria-label="완료 처리"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        t.is_done ? "border-blue-500 bg-blue-500" : "border-slate-200"}`}>
                {t.is_done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </button>
              <p className={`flex-1 text-[14px] font-semibold ${t.is_done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                {t.title}
              </p>
              <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${TAGS.ltg.chip}`}>LTG</span>
            </div>
          ))}
          <p className="mt-3 rounded-2xl bg-white p-3 text-[11.5px] font-medium text-slate-400 shadow-sm">
            하위 과업은 Tasks 전체 목록에도 LTG 태그로 함께 표시돼요.
          </p>
        </>
      ) : loading ? (
        <Spinner label="하위 과업을 구성하는 중…" />
      ) : err ? (
        <div className="py-10 text-center">
          <p className="mb-3 text-[12.5px] text-slate-500">{err}</p>
          <button onClick={run} className="rounded-xl bg-blue-500 px-5 py-2.5 text-[12px] font-bold text-white">다시 시도</button>
        </div>
      ) : draft ? (
        <>
          <div className="mb-3 flex items-center gap-1.5 text-[11.5px] font-bold text-blue-600">
            <Sparkles className="h-3.5 w-3.5" /> LTG Breakdown 초안 — 수정 후 확정하세요
          </div>
          {draft.map((d, i) => (
            <div key={d.key}
                 className={`mb-2 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm ${
                   d.keep ? "bg-white ring-2 ring-blue-500" : "bg-white/60"}`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-extrabold text-blue-600">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13.5px] font-semibold ${d.keep ? "text-slate-800" : "text-slate-400 line-through"}`}>
                  {d.title}
                </p>
                {d.estimated_minutes && (
                  <p className="text-[10px] font-semibold text-slate-400">약 {d.estimated_minutes}분</p>
                )}
              </div>
              <button onClick={() => setDraft((p) => p.map((x) => (x.key === d.key ? { ...x, keep: !x.keep } : x)))}
                      className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-500">
                {d.keep ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
          <button onClick={confirm}
                  className="mt-3 w-full rounded-xl bg-blue-500 py-3 text-[12.5px] font-bold text-white">
            Confirm & Add to Tasks ({draft.filter((d) => d.keep).length})
          </button>
        </>
      ) : null}
    </>
  );
}
