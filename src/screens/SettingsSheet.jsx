import { useState } from "react";
import {
  Bell, BellOff, ChevronLeft, Link2, Loader2, Minus, Plus, Unlink,
} from "lucide-react";
import { SectionTitle } from "../components/ui";
import { TAG_KEYS, TAGS } from "../lib/core";
import { useSettings } from "../hooks/useSettings";
import { push } from "../lib/supabase";

export default function SettingsSheet({ userId, onClose }) {
  const s = useSettings(userId);
  const [busy, setBusy] = useState(null); // 어떤 액션이 진행 중인지
  const [msg, setMsg] = useState(null);

  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg(String(e.message ?? e)); }
    setBusy(null);
  };

  if (s.loading || !s.profile) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 bg-slate-50">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500" aria-label="닫기">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[16px] font-extrabold text-slate-800">설정</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* 하루 최대 할 일 수 */}
          <SectionTitle>하루 최대 할 일 수 (루틴 제외)</SectionTitle>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] text-slate-400">
              루틴을 뺀 오늘 할 일이 이 개수를 넘으면 무리한 계획은 아닌지 물어봐요.
            </p>
            <div className="flex items-center justify-center gap-5">
              <button onClick={() => s.updateMaxDailyTasks(Math.max(1, s.profile.max_daily_tasks - 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="줄이기">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-[24px] font-extrabold text-slate-800">{s.profile.max_daily_tasks}</span>
              <button onClick={() => s.updateMaxDailyTasks(Math.min(20, s.profile.max_daily_tasks + 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="늘리기">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 알림 시간 — 저녁 계획 / 아침 브리핑 (루틴으로도 등록됨) */}
          <SectionTitle>알림 시간</SectionTitle>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-[12px] text-slate-400">
              이 시간에 맞춰 "저녁 계획 세우기" · "아침 브리핑 확인" 루틴도 함께 옮겨져요.
            </p>
            <TimeRow label="저녁 계획" value={s.profile.evening_plan_time?.slice(0, 5)}
                     onChange={(v) => s.updateTimes({ eveningPlanTime: v, morningBriefTime: s.profile.morning_brief_time?.slice(0, 5) })} />
            <TimeRow label="아침 브리핑" value={s.profile.morning_brief_time?.slice(0, 5)}
                     onChange={(v) => s.updateTimes({ eveningPlanTime: s.profile.evening_plan_time?.slice(0, 5), morningBriefTime: v })} />

            <div className="mt-4 border-t border-slate-100 pt-4">
              <button onClick={() => run("push", s.pushEnabled ? s.disablePush : s.enablePush)}
                      disabled={busy === "push"}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[12.5px] font-bold ${
                        s.pushEnabled ? "bg-slate-100 text-slate-600" : "bg-blue-500 text-white"}`}>
                {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" />
                  : s.pushEnabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {s.pushEnabled ? "알림 끄기" : "이 기기에서 알림 받기"}
              </button>
              {s.pushEnabled && (
                <button onClick={() => run("test", () => push.sendTest("테스트 알림", "잘 도착했어요 🎉"))}
                        disabled={busy === "test"}
                        className="mt-2 w-full rounded-xl py-2.5 text-[11.5px] font-bold text-blue-500">
                  {busy === "test" ? "보내는 중…" : "테스트 알림 보내기"}
                </button>
              )}
            </div>
          </div>

          {/* Outlook 연동 */}
          <SectionTitle>업무용 Outlook 연동</SectionTitle>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {s.conn ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[13.5px] font-bold text-slate-800">{s.conn.account_email ?? "연결됨"}</p>
                    <p className="text-[11px] text-slate-400">Allocator → Outlook 일방향 전송</p>
                  </div>
                  <Switch checked={s.conn.is_enabled} onChange={(v) => s.toggleOutlookEnabled(v)} />
                </div>

                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Push할 태그</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {TAG_KEYS.map((k) => {
                    const on = s.conn.push_tags?.includes(k);
                    return (
                      <button key={k}
                              onClick={() => s.updatePushTags(on
                                ? s.conn.push_tags.filter((x) => x !== k)
                                : [...(s.conn.push_tags ?? []), k])}
                              className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${TAGS[k].chip} ${on ? "ring-2 ring-slate-800" : "opacity-40"}`}>
                        {TAGS[k].label}
                      </button>
                    );
                  })}
                </div>

                <button onClick={() => run("disconnect", s.disconnectOutlook)} disabled={busy === "disconnect"}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-[11.5px] font-bold text-slate-500">
                  <Unlink className="h-3.5 w-3.5" /> 연결 해제
                </button>
              </>
            ) : (
              <>
                <p className="mb-3 text-[12px] text-slate-400">
                  연결하면 Allocator에서 "저장 & Outlook으로 전송"을 눌렀을 때 일정이 업무용 캘린더에 반영돼요.
                  (Outlook → 앱 방향으로는 가져오지 않아요)
                </p>
                <button onClick={() => run("connect", s.connectOutlook)} disabled={busy === "connect"}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-[12.5px] font-bold text-white">
                  {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Outlook 계정 연결
                </button>
              </>
            )}
          </div>

          {msg && <p className="mt-3 text-center text-[11.5px] font-semibold text-rose-500">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

function TimeRow({ label, value, onChange }) {
  return (
    <div className="mb-2 flex items-center justify-between last:mb-0">
      <span className="text-[13px] font-semibold text-slate-600">{label}</span>
      <input type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
             className="rounded-lg bg-slate-100 px-3 py-2 text-[13px] font-semibold" />
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} aria-label="토글"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-slate-200"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}
