import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarRange, Check, ListTodo, LogOut, Mic, Settings as SettingsIcon, Target } from "lucide-react";
import { auth, useSession } from "./hooks/useAuth";
import { useScheduler } from "./hooks/useScheduler";
import { useSettings } from "./hooks/useSettings";
import { Celebration, OverloadNudge, Spinner, TaskComposer } from "./components/ui";
import AuthScreen from "./screens/AuthScreen";
import TodayScreen from "./screens/TodayScreen";
import AllocatorScreen from "./screens/AllocatorScreen";
import TasksScreen from "./screens/TasksScreen";
import LTGScreen from "./screens/LTGScreen";
import StatsScreen from "./screens/StatsScreen";
import SettingsSheet from "./screens/SettingsSheet";

const TABS = [
  { key: "today", label: "Today", Icon: Check },
  { key: "allocator", label: "Allocator", Icon: CalendarRange },
  { key: "tasks", label: "Tasks", Icon: ListTodo },
  { key: "ltg", label: "LTG", Icon: Target },
  { key: "stats", label: "Stats", Icon: BarChart3 },
];

export default function App() {
  const { user, loading: authLoading } = useSession();
  if (authLoading) return <div className="flex min-h-dvh items-center justify-center bg-slate-50"><Spinner /></div>;
  if (!user) return <AuthScreen />;
  return <Shell userId={user.id} onSignOut={auth.signOut} />;
}

function Shell({ userId, onSignOut }) {
  const data = useScheduler(userId);
  const settings = useSettings(userId); // 과부하 넛지 판단에 필요한 max_daily_tasks만 여기서도 참조
  const [tab, setTab] = useState("today");
  const [composing, setComposing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [overload, setOverload] = useState(false);
  const wasAllDone = useRef(false);
  const wasOverloaded = useRef(false);

  /* 오늘 계획을 전부 끝내는 순간 한 번만 축하 */
  const active = data.entries.filter((e) => !e.is_skipped);
  const doneCount = active.filter((e) => e.actual_duration != null).length;
  useEffect(() => {
    const allDone = active.length > 0 && doneCount === active.length;
    if (allDone && !wasAllDone.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2600);
      wasAllDone.current = true;
      return () => clearTimeout(t);
    }
    if (!allDone) wasAllDone.current = false;
  }, [doneCount, active.length]);

  /* 루틴 제외, 오늘 배정된 할 일이 기준치를 넘는 순간 한 번 물어본다 */
  const nonRoutineCount = data.entries.filter((e) => {
    const t = data.tasks.find((x) => x.id === e.task_id);
    return t && t.repeat_rule === "none";
  }).length;
  const limit = settings.profile?.max_daily_tasks ?? 6;
  useEffect(() => {
    const isOver = nonRoutineCount > limit;
    if (isOver && !wasOverloaded.current) {
      setOverload(true);
      wasOverloaded.current = true;
    }
    if (!isOver) wasOverloaded.current = false;
  }, [nonRoutineCount, limit]);

  const Screen = {
    today: TodayScreen,
    allocator: AllocatorScreen,
    tasks: TasksScreen,
    ltg: LTGScreen,
    stats: StatsScreen,
  }[tab];

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <Celebration show={celebrate} />

      {overload && (
        <OverloadNudge count={nonRoutineCount} limit={limit}
                        onClose={() => setOverload(false)}
                        onOpenSettings={() => { setOverload(false); setSettingsOpen(true); }} />
      )}

      {settingsOpen && <SettingsSheet userId={userId} onClose={() => setSettingsOpen(false)} />}

      {data.error && (
        <div className="bg-rose-50 px-4 py-2 text-center text-[11.5px] font-semibold text-rose-600">
          {data.error}
        </div>
      )}

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-3">
        {data.loading ? <Spinner label="불러오는 중…" /> : <Screen data={data} userId={userId} />}
      </main>

      {(tab === "today" || tab === "tasks") && (
        <button onClick={() => setComposing(true)} aria-label="새 태스크"
                className="fixed bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl shadow-blue-500/40">
          <Mic className="h-5 w-5" />
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
                  className={`flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold ${
                    tab === key ? "text-blue-600" : "text-slate-400"}`}>
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </button>
        ))}
        <button onClick={() => setSettingsOpen(true)} aria-label="설정"
                className="flex flex-col items-center justify-center px-2.5 text-slate-300">
          <SettingsIcon className="h-4 w-4" />
        </button>
        <button onClick={onSignOut} aria-label="로그아웃"
                className="flex flex-col items-center justify-center px-2.5 text-slate-300">
          <LogOut className="h-4 w-4" />
        </button>
      </nav>

      {composing && (
        <TaskComposer onClose={() => setComposing(false)}
                      onSave={async (draft) => { await data.addTask(draft); setComposing(false); }} />
      )}
    </div>
  );
}
