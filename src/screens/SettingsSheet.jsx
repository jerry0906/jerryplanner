import { useState } from "react";
import {
  Bell, BellOff, CalendarPlus, Check, ChevronLeft, Copy, Loader2, LogOut, Minus, Plus, RefreshCw, Unlink,
} from "lucide-react";
import { SectionTitle } from "../components/ui";
import { TAG_KEYS, TAGS } from "../lib/core";
import { useSettings } from "../hooks/useSettings";
import { icsFeedUrl, push } from "../lib/supabase";

export default function SettingsSheet({ userId, onClose, onSignOut }) {
  const s = useSettings(userId);
  const [busy, setBusy] = useState(null); // 어떤 액션이 진행 중인지
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  const copyIcs = async () => {
    await navigator.clipboard.writeText(icsFeedUrl(s.profile.ics_token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try {
      await fn();
    } catch (e) {
      const m = String(e.message ?? e);
      setMsg(m.includes("Failed to fetch")
        ? "서버 기능이 아직 배포되지 않았어요. (supabase functions deploy)"
        : m);
    }
    setBusy(null);
  };

  if (s.loading) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!s.profile) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-6">
        <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center">
          <p className="text-[13px] font-bold text-slate-800">설정을 불러오지 못했어요</p>
          <p className="mt-1 text-[11.5px] text-slate-500">{s.error ?? "프로필 정보가 없습니다."}</p>
          <button onClick={onClose} className="mt-4 w-full rounded-xl bg-slate-100 py-2.5 text-[12px] font-bold text-slate-600">
            닫기
          </button>
        </div>
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

          {/* ICS 구독 피드 — Outlook 등에서 "인터넷 일정 구독"으로 추가 */}
          <SectionTitle>캘린더 구독 (ICS)</SectionTitle>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {s.profile.ics_token ? (
              <>
                <p className="mb-2 text-[12px] text-slate-400">
                  Outlook → 캘린더 추가 → 웹에서 구독에 아래 주소를 붙여넣으세요.
                  읽기 전용이고, 반영까지 몇 시간 걸릴 수 있어요.
                </p>
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 py-1.5 pl-3 pr-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-slate-500">
                    {icsFeedUrl(s.profile.ics_token)}
                  </span>
                  <button onClick={() => run("copy", copyIcs)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-500 shadow-sm">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "복사됨" : "복사"}
                  </button>
                </div>

                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">내보낼 태그</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {TAG_KEYS.map((k) => {
                    const on = s.profile.ics_tags?.includes(k);
                    return (
                      <button key={k}
                              onClick={() => s.updateIcsTags(on
                                ? s.profile.ics_tags.filter((x) => x !== k)
                                : [...(s.profile.ics_tags ?? []), k])}
                              className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${TAGS[k].chip} ${on ? "ring-2 ring-slate-800" : "opacity-40"}`}>
                        {TAGS[k].label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => run("ics", s.createIcsToken)} disabled={busy === "ics"}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-[11.5px] font-bold text-slate-500">
                    <RefreshCw className="h-3.5 w-3.5" /> 주소 새로 만들기
                  </button>
                  <button onClick={() => run("ics", s.disableIcs)} disabled={busy === "ics"}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-[11.5px] font-bold text-slate-500">
                    <Unlink className="h-3.5 w-3.5" /> 구독 끄기
                  </button>
                </div>
                <p className="mt-2 text-[10.5px] text-slate-300">
                  주소를 아는 사람은 누구나 일정을 볼 수 있어요. 유출됐다면 새로 만들면 예전 주소는 끊겨요.
                </p>
              </>
            ) : (
              <>
                <p className="mb-3 text-[12px] text-slate-400">
                  구독 주소를 만들면 Outlook·Google·Apple 캘린더에서 배정된 일정과 루틴을 볼 수 있어요.
                  (캘린더 → 앱 방향으로는 가져오지 않아요)
                </p>
                <button onClick={() => run("ics", s.createIcsToken)} disabled={busy === "ics"}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-[12.5px] font-bold text-white">
                  {busy === "ics" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                  구독 주소 만들기
                </button>
              </>
            )}
          </div>

          {msg && <p className="mt-3 text-center text-[11.5px] font-semibold text-rose-500">{msg}</p>}

          <SectionTitle>계정</SectionTitle>
          <button onClick={onSignOut}
                  className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[12.5px] font-bold text-rose-500 shadow-sm">
            <LogOut className="h-4 w-4" /> 로그아웃
          </button>
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
