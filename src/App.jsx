import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, ListTodo, Settings as SettingsIcon, Target } from "lucide-react";
import { auth, useSession } from "./hooks/useAuth";
import { useScheduler } from "./hooks/useScheduler";
import { useSettings } from "./hooks/useSettings";
import { Celebration, OverloadNudge, Spinner, TaskComposer } from "./components/ui";
import AuthScreen from "./screens/AuthScreen";
import TasksScreen from "./screens/TasksScreen";
import TodayScreen from "./screens/TodayScreen";
import LTGScreen from "./screens/LTGScreen";
import StatsScreen from "./screens/StatsScreen";
import SettingsSheet from "./screens/SettingsSheet";

// 순서: Tasks → Today → LTG → Stats → Settings. 기본은 Tasks.
const TABS = [
  { key: "tasks", label: "Tasks", Icon: ListTodo },
  { key: "today", label: "Today", Icon: CalendarDays },
  { key: "ltg", label: "LTG", Icon: Target },
  { key: "stats", label: "Stats", Icon: BarChart3 },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function App() {
  const { user, loading: authLoading } = useSession();
  if (authLoading) return <div className="flex min-h-dvh items-center justify-center bg-slate-50"><Spinner /></div>;
  if (!user) return <AuthScreen />;
  return <Shell userId={user.id} onSignOut={auth.signOut} />;
}

function Shell({ userId, onSignOut }) {
  const data = useScheduler(userId);
  const settings = useSettings(userId);
  const [tab, setTab] = useState("tasks");
  const [composing, setComposing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [overload, setOverload] = useState(false);
  const wasAllDone = useRef(false);
  const wasOverloaded = useRef(false);

  /* 그날 배정한 일을 전부 끝내면 한 번 축하 */
  const doneCount = data.entries.filter((e) => e.actual_duration != null).length;
  useEffect(() => {
    const allDone = data.entries.length > 0 && doneCount === data.entries.length;
    if (allDone && !wasAllDone.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2600);
      wasAllDone.current = true;
      return () => clearTimeout(t);
    }
    if (!allDone) wasAllDone.current = false;
  }, [doneCount, data.entries.length]);

  /* 루틴 제외, 오늘 선정한 할 일이 기준치를 넘으면 한 번 물어본다 */
  const selectedCount = data.tasks.filter(
    (t) => t.is_selected && t.status === "todo" && t.repeat_rule === "none",
  ).length;
  const limit = settings.profile?.max_daily_tasks ?? 6;
  useEffect(() => {
    const isOver = selectedCount > limit;
    if (isOver && !wasOverloaded.current) { setOverload(true); wasOverloaded.current = true; }
    if (!isOver) wasOverloaded.current = false;
  }, [selectedCount, limit]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <Celebration show={celebrate} />

      {overload && (
        <OverloadNudge count={selectedCount} limit={limit}
                       onClose={() => setOverload(false)}
                       onOpenSettings={() => { setOverload(false); setTab("settings"); }} />
      )}

      {data.error && (
        <div className="bg-rose-50 px-4 py-2 text-center text-[11.5px] font-semibold text-rose-600">
          {data.error}
        </div>
      )}

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-3">
        {data.loading && tab !== "settings" ? <Spinner label="불러오는 중…" /> : (
          <>
            {tab === "tasks" && <TasksScreen data={data} onCompose={() => setComposing(true)} />}
            {tab === "today" && <TodayScreen data={data} />}
            {tab === "ltg" && <LTGScreen data={data} />}
            {tab === "stats" && <StatsScreen data={data} />}
          </>
        )}
      </main>

      {tab === "settings" && (
        <SettingsSheet userId={userId} onSignOut={onSignOut} onClose={() => setTab("tasks")} />
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
      </nav>

      {composing && (
        <TaskComposer onClose={() => setComposing(false)}
                      onSave={async (draft) => { await data.addTask(draft); setComposing(false); }} />
      )}
    </div>
  );
}
