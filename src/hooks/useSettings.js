import { useCallback, useEffect, useState } from "react";
import { supabase, outlook } from "../lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function useSettings(userId) {
  const [profile, setProfile] = useState(null);
  const [conn, setConn] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [p, c] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("outlook_connections").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    setProfile(p.data ?? null);
    setConn(c.data ?? null);

    if ("serviceWorker" in navigator && "PushManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /* ── 프로필 설정 ───────────────────────────── */
  const updateMaxDailyTasks = async (n) => {
    setProfile((p) => (p ? { ...p, max_daily_tasks: n } : p));
    await supabase.from("profiles").update({ max_daily_tasks: n }).eq("id", userId);
  };

  const updateTimes = async ({ eveningPlanTime, morningBriefTime }) => {
    setProfile((p) => (p ? { ...p, evening_plan_time: eveningPlanTime, morning_brief_time: morningBriefTime } : p));
    await supabase.from("profiles").update({
      evening_plan_time: eveningPlanTime,
      morning_brief_time: morningBriefTime,
    }).eq("id", userId);

    // 이 시간에 맞춰 시스템 루틴(저녁 계획/아침 브리핑) 태스크의 고정 시간도 같이 옮긴다
    await supabase.from("tasks")
      .update({ fixed_start_time: eveningPlanTime, fixed_end_time: addMinutes(eveningPlanTime, 20) })
      .eq("user_id", userId).eq("system_kind", "evening_plan");
    await supabase.from("tasks")
      .update({ fixed_start_time: morningBriefTime, fixed_end_time: addMinutes(morningBriefTime, 10) })
      .eq("user_id", userId).eq("system_kind", "morning_brief");
  };

  /* ── Outlook ───────────────────────────────── */
  const connectOutlook = async () => {
    await outlook.connect(userId);
    await load();
  };

  const disconnectOutlook = async () => {
    setConn(null);
    await supabase.from("outlook_connections").delete().eq("user_id", userId);
  };

  const toggleOutlookEnabled = async (enabled) => {
    setConn((p) => (p ? { ...p, is_enabled: enabled } : p));
    await supabase.from("outlook_connections").update({ is_enabled: enabled }).eq("user_id", userId);
  };

  const updatePushTags = async (tags) => {
    setConn((p) => (p ? { ...p, push_tags: tags } : p));
    await supabase.from("outlook_connections").update({ push_tags: tags }).eq("user_id", userId);
  };

  /* ── Web Push 구독 ─────────────────────────── */
  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("이 브라우저는 푸시 알림을 지원하지 않아요.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("알림 권한이 거부됐어요.");

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = sub.toJSON();
    await supabase.from("push_subscriptions").upsert({
      user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
    }, { onConflict: "endpoint" });
    setPushEnabled(true);
  };

  const disablePush = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setPushEnabled(false);
  };

  return {
    profile, conn, pushEnabled, loading,
    updateMaxDailyTasks, updateTimes,
    connectOutlook, disconnectOutlook, toggleOutlookEnabled, updatePushTags,
    enablePush, disablePush,
  };
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h * 60 + m + mins) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
