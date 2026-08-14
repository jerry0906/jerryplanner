import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_DUR } from "../lib/core";

/**
 * 특정 날짜 하나의 schedule_entries를 다룬다.
 *
 * 루틴(repeat_rule <> 'none')은 여기서 미리 행을 만들지 않는다.
 * 타임라인에 흐리게 항상 표시되는 "고정 배경"이고, 사용자가 완료 체크를 할 때
 * 비로소 실제 entry가 만들어진다. (안 쓰는 날의 빈 행이 쌓이지 않도록)
 */
export function useDayPlan(userId, date, tasks) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef({});

  const load = useCallback(async () => {
    if (!userId || !date) return;
    setLoading(true);
    const { data } = await supabase.from("schedule_entries").select("*").eq("date", date);
    setEntries(data ?? []);
    setLoading(false);
  }, [userId, date]);

  useEffect(() => { load(); }, [load]);

  const queueSave = (id, patch) => {
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(async () => {
      await supabase.from("schedule_entries").update(patch).eq("id", id);
    }, 400);
  };

  const assign = async (taskId, startMinute, durationMinutes = DEFAULT_DUR) => {
    if (entries.some((e) => e.task_id === taskId)) return;
    const optimistic = {
      id: `tmp-${taskId}`, user_id: userId, task_id: taskId, date,
      start_minute: startMinute, duration_minutes: durationMinutes,
      actual_start: null, actual_duration: null, is_skipped: false, outlook_event_id: null,
    };
    setEntries((p) => [...p, optimistic]);

    const { data, error } = await supabase.from("schedule_entries").insert({
      user_id: userId, task_id: taskId, date,
      start_minute: startMinute, duration_minutes: durationMinutes,
    }).select().single();

    if (error) {
      setEntries((p) => p.filter((e) => e.id !== optimistic.id));
      return;
    }
    setEntries((p) => p.map((e) => (e.id === optimistic.id ? data : e)));
    return data;
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
