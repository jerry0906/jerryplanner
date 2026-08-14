import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { minToTime, todayISO } from "../lib/core";
import { useDayPlan } from "./useDayPlan";

/**
 * tasks / ltgs 원본 데이터 레이어.
 *
 * 원칙: tasks가 할 일의 원본이다.
 *  - 우선순위        → tasks.sort_order
 *  - 오늘 선정        → tasks.is_selected  (Tasks 화면의 Today 체크)
 *  - 상태            → tasks.status ('todo' | 'followup' | 'done')
 *  - 언제/얼마나 할지 → schedule_entries (날짜별로 다르므로 tasks에 두지 않는다)
 */
export function useScheduler(userId) {
  const [tasks, setTasks] = useState(null);
  const [ltgs, setLtgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const today = todayISO();

  // Today 화면은 날짜를 넘나들 수 있으므로 보고 있는 날짜를 여기서 관리한다
  const [viewDate, setViewDate] = useState(today);
  const day = useDayPlan(userId, viewDate, tasks);

  const loadBase = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [t, g] = await Promise.all([
        supabase.from("tasks").select("*").order("sort_order"),
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
    const maxOrder = (tasks ?? []).reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
    const row = {
      user_id: userId,
      title: draft.title,
      type_tag: draft.type_tag ?? "work",
      ltg_id: draft.ltg_id ?? null,
      repeat_rule: draft.repeat_rule ?? "none",
      days_of_week: draft.days_of_week ?? null,
      fixed_start_time: minToTime(draft.fixed_start ?? null),
      fixed_end_time: minToTime(draft.fixed_end ?? null),
      source: draft.source ?? "text",
      sort_order: maxOrder + 10,
      is_selected: draft.is_selected ?? false,
      status: "todo",
    };
    const { data, error } = await supabase.from("tasks").insert(row).select().single();
    if (error) return setError(error.message);
    setTasks((p) => [...p, data]);
    return data;
  };

  const addTasks = async (rows) => {
    let order = (tasks ?? []).reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
    const { data, error } = await supabase.from("tasks").insert(
      rows.map((r) => ({
        user_id: userId, type_tag: "ltg", repeat_rule: "none",
        status: "todo", is_selected: false, sort_order: (order += 10), ...r,
      })),
    ).select();
    if (error) return setError(error.message);
    setTasks((p) => [...p, ...data]);
  };

  const patchTask = (taskId, patch) => {
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    supabase.from("tasks").update(patch).eq("id", taskId)
      .then(({ error }) => error && setError(error.message));
  };

  /** TaskComposer(수정 모드)에서 넘어온 초안을 그대로 저장 */
  const updateTaskFromDraft = (taskId, draft) => {
    patchTask(taskId, {
      title: draft.title,
      type_tag: draft.type_tag,
      is_selected: draft.is_selected,
      repeat_rule: draft.repeat_rule,
      days_of_week: draft.days_of_week,
      fixed_start_time: minToTime(draft.fixed_start ?? null),
      fixed_end_time: minToTime(draft.fixed_end ?? null),
    });
  };

  /** Tasks 화면의 Today 체크 — 오늘 할 일로 선정/해제 */
  const toggleSelected = (taskId) => {
    const t = tasks.find((x) => x.id === taskId);
    patchTask(taskId, { is_selected: !t?.is_selected });
  };

  /** 드래그로 바뀐 우선순위 순서를 통째로 저장 */
  const reorderTasks = async (orderedIds) => {
    const updates = orderedIds.map((id, i) => ({ id, sort_order: (i + 1) * 10 }));
    setTasks((p) => {
      const map = new Map(updates.map((u) => [u.id, u.sort_order]));
      return p.map((t) => (map.has(t.id) ? { ...t, sort_order: map.get(t.id) } : t))
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });
    await Promise.all(updates.map((u) =>
      supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id)));
  };

  const deleteTask = async (taskId) => {
    setTasks((p) => p.filter((t) => t.id !== taskId));
    await supabase.from("tasks").delete().eq("id", taskId);
  };

  /** 타임라인에서 완료 체크 */
  const toggleDone = (taskId) => {
    const entry = day.entries.find((e) => e.task_id === taskId);
    const task = tasks.find((t) => t.id === taskId);
    const nowDone = entry ? entry.actual_duration == null : task?.status !== "done";

    if (entry) {
      day.updateEntry(entry.id, nowDone
        ? { actual_start: entry.actual_start ?? entry.start_minute,
            actual_duration: entry.actual_duration ?? entry.duration_minutes }
        : { actual_start: null, actual_duration: null });
    }
    patchTask(taskId, { status: nowDone ? "done" : "todo", is_done: nowDone });
  };

  /** 타임라인 → 팔로우업 박스로 드래그 (배정 해제 + 상태 변경) */
  const moveToFollowup = async (taskId) => {
    const entry = day.entries.find((e) => e.task_id === taskId);
    if (entry) await day.unassign(entry.id);
    patchTask(taskId, { status: "followup" });
  };

  /** 팔로우업 → 다시 할 일로 */
  const backToTodo = (taskId) => patchTask(taskId, { status: "todo" });

  /* ── LTG ───────────────────────────────────── */
  const addLTG = async (title, dueDate, outcome) => {
    const { data, error } = await supabase.from("ltgs")
      .insert({ user_id: userId, title, due_date: dueDate, outcome: outcome || null })
      .select().single();
    if (error) return setError(error.message);
    setLtgs((p) => [...p, data]);
    return data;
  };

  const updateLTG = (id, patch) => {
    setLtgs((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    supabase.from("ltgs").update(patch).eq("id", id)
      .then(({ error }) => error && setError(error.message));
  };

  const deleteLTG = async (id) => {
    setLtgs((p) => p.filter((g) => g.id !== id));
    setTasks((p) => p.filter((t) => t.ltg_id !== id));
    await supabase.from("ltgs").delete().eq("id", id);
  };

  return {
    tasks: tasks ?? [], ltgs, today,
    viewDate, setViewDate,
    entries: day.entries,
    loading: loading || day.loading,
    error,
    reload: () => { loadBase(); day.reload(); },
    addTask, addTasks, patchTask, updateTaskFromDraft, toggleSelected, reorderTasks, deleteTask,
    assign: day.assign, updateEntry: day.updateEntry, unassign: day.unassign,
    toggleDone, moveToFollowup, backToTodo,
    addLTG, updateLTG, deleteLTG,
  };
}
