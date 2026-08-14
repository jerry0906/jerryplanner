import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_DUR, minToTime, repeatsOn, timeToMin } from "../lib/core";

/**
 * 특정 날짜 하나의 schedule_entries만 다루는 훅.
 * Today/Stats는 항상 "오늘"만 보면 되지만, Allocator는 저녁에 "내일"을 계획해야 하므로
 * 날짜를 바꿔 끼울 수 있게 useScheduler에서 분리해 두었다.
 */
export function useDayPlan(userId, date, tasks) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef({});

  const load = useCallback(async () => {
    if (!userId || !date || tasks == null) return;
    setLoading(true);
    const { data } = await supabase.from("schedule_entries").select("*").eq("date", date);
    setEntries(await ensureRoutineEntries(tasks, data ?? [], date, userId));
    setLoading(false);
  }, [userId, date, tasks]);

  useEffect(() => { load(); }, [load]);

  const queueSave = (id, patch) => {
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(async () => {
      await supabase.from("schedule_entries").update(patch).eq("id", id);
    }, 400);
  };

  const assign = async (taskId, startMinute) => {
    if (entries.some((e) => e.task_id === taskId)) return;
    const optimistic = {
      id: `tmp-${taskId}`, user_id: userId, task_id: taskId, date,
      start_minute: startMinute, duration_minutes: DEFAULT_DUR,
      actual_start: null, actual_duration: null, is_skipped: false, outlook_event_id: null,
    };
    setEntries((p) => [...p, optimistic]);

    const { data, error } = await supabase.from("schedule_entries").insert({
      user_id: userId, task_id: taskId, date, start_minute: startMinute, duration_minutes: DEFAULT_DUR,
    }).select().single();

    if (error) return setEntries((p) => p.filter((e) => e.id !== optimistic.id));
    setEntries((p) => p.map((e) => (e.id === optimistic.id ? data : e)));
    await supabase.from("tasks").update({ duration_minutes: DEFAULT_DUR }).eq("id", taskId);
  };

  const updateEntry = (id, patch) => {
    setEntries((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    if (!String(id).startsWith("tmp-")) queueSave(id, patch);
  };

  const unassign = async (id) => {
    setEntries((p) => p.filter((e) => e.id !== id));
    if (!String(id).startsWith("tmp-")) await supabase.from("schedule_entries").delete().eq("id", id);
  };

  return { entries, loading, assign, updateEntry, unassign, reload: load };
}

async function ensureRoutineEntries(tasks, existing, date, userId) {
  const have = new Set(existing.map((e) => e.task_id));
  const missing = tasks.filter(
    (t) => t.repeat_rule !== "none" && repeatsOn(t, date) && !have.has(t.id) && t.fixed_start_time,
  );
  if (missing.length === 0) return existing;

  const rows = missing.map((t) => {
    const s = timeToMin(t.fixed_start_time);
    const e = timeToMin(t.fixed_end_time) ?? s + DEFAULT_DUR;
    return { user_id: userId, task_id: t.id, date, start_minute: s, duration_minutes: Math.max(15, e - s) };
  });

  const { data, error } = await supabase.from("schedule_entries").insert(rows).select();
  if (error) return existing;
  return [...existing, ...data];
}
