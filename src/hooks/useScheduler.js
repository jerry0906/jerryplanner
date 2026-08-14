import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { minToTime, todayISO } from "../lib/core";
import { useDayPlan } from "./useDayPlan";

/**
 * "오늘" 화면들(Today/Tasks/Stats)이 쓰는 데이터 레이어.
 * 날짜별 스케줄 CRUD 자체는 useDayPlan에 위임하고, 여기서는
 * 날짜에 매이지 않는 tasks/ltgs와 "완료 처리"만 다룬다.
 * (Allocator가 내일을 계획할 때는 useDayPlan을 따로 직접 부른다)
 */
export function useScheduler(userId) {
  const [tasks, setTasks] = useState(null);
  const [ltgs, setLtgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const date = todayISO();

  const day = useDayPlan(userId, date, tasks);

  const loadBase = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [t, g] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at"),
        supabase.from("ltgs").select("*").order("due_date"),
      ]);
      if (t.error) throw t.error;
      if (g.error) throw g.error;
      setTasks(t.data);
      setLtgs(g.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadBase(); }, [loadBase]);

  /* ── Tasks ─────────────────────────────────── */
  const addTask = async (draft) => {
    const row = {
      user_id: userId,
      title: draft.title,
      category: draft.category ?? "today",
      type_tag: draft.type_tag ?? "work",
      ltg_id: draft.ltg_id ?? null,
      repeat_rule: draft.repeat_rule ?? "none",
      days_of_week: draft.days_of_week ?? null,
      fixed_start_time: minToTime(draft.fixed_start ?? null),
      fixed_end_time: minToTime(draft.fixed_end ?? null),
      source: draft.source ?? "text",
    };
    const { data, error } = await supabase.from("tasks").insert(row).select().single();
    if (error) return setError(error.message);
    setTasks((p) => [...p, data]);
    return data;
  };

  const addTasks = async (rows) => {
    const { data, error } = await supabase.from("tasks").insert(
      rows.map((r) => ({ user_id: userId, category: "later", type_tag: "ltg", repeat_rule: "none", ...r })),
    ).select();
    if (error) return setError(error.message);
    setTasks((p) => [...p, ...data]);
  };

  const moveTaskCategory = (taskId, category) => {
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, category } : t)));
    supabase.from("tasks").update({ category }).eq("id", taskId).then(({ error }) => error && setError(error.message));
  };

  const updateTaskTag = (taskId, type_tag) => {
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, type_tag } : t)));
    supabase.from("tasks").update({ type_tag }).eq("id", taskId).then(({ error }) => error && setError(error.message));
  };

  const deleteTask = async (taskId) => {
    setTasks((p) => p.filter((t) => t.id !== taskId));
    await supabase.from("tasks").delete().eq("id", taskId);
  };

  /**
   * 완료 토글. entry(오늘 배정분)가 있으면 actual_*을 채우고,
   * 없으면(아직 Allocator에 배정 안 된 Later/Follow-up 항목 등) tasks.is_done만 바꾼다.
   */
  const toggleDone = (taskId) => {
    const entry = day.entries.find((e) => e.task_id === taskId);
    if (entry) {
      const nowDone = entry.actual_duration == null;
      day.updateEntry(entry.id, nowDone
        ? { actual_start: entry.actual_start ?? entry.start_minute, actual_duration: entry.actual_duration ?? entry.duration_minutes }
        : { actual_start: null, actual_duration: null });
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, is_done: nowDone } : t)));
      supabase.from("tasks").update({ is_done: nowDone }).eq("id", taskId);
    } else {
      const task = tasks.find((t) => t.id === taskId);
      const nowDone = !task?.is_done;
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, is_done: nowDone } : t)));
      supabase.from("tasks").update({ is_done: nowDone }).eq("id", taskId);
    }
  };

  /* ── LTG ───────────────────────────────────── */
  const addLTG = async (title, dueDate) => {
    const { data, error } = await supabase.from("ltgs")
      .insert({ user_id: userId, title, due_date: dueDate }).select().single();
    if (error) return setError(error.message);
    setLtgs((p) => [...p, data]);
    return data;
  };

  const deleteLTG = async (id) => {
    setLtgs((p) => p.filter((g) => g.id !== id));
    setTasks((p) => p.filter((t) => t.ltg_id !== id));
    await supabase.from("ltgs").delete().eq("id", id);
  };

  return {
    tasks: tasks ?? [], entries: day.entries, ltgs, date,
    loading: loading || day.loading,
    error,
    reload: () => { loadBase(); day.reload(); },
    addTask, addTasks, moveTaskCategory, updateTaskTag, deleteTask,
    updateEntry: day.updateEntry, unassign: day.unassign, toggleDone,
    addLTG, deleteLTG,
  };
}
