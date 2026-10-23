import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * 현재 브라우저의 푸시 구독 상태를 확인한다.
 *
 * 주의: navigator.serviceWorker.ready 는 서비스워커가 등록되어 있지 않으면
 * 영원히 resolve 되지 않는다(개발 모드가 대표적). 그래서 등록 여부를 먼저
 * 확인하고, 그래도 모를 상황에 대비해 타임아웃을 건다.
 */
async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await Promise.race([
    navigator.serviceWorker.getRegistration(),
    new Promise((r) => setTimeout(() => r(null), 2000)),
  ]);
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export function useSettings(userId) {
  const [profile, setProfile] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const p = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

      // 트리거가 생기기 전에 가입한 계정은 profiles 행이 없다. 그 자리에서 만들어 준다.
      let prof = p.data;
      if (!prof) {
        const { data: created, error: insErr } = await supabase
          .from("profiles").insert({ id: userId }).select().single();
        if (insErr) throw insErr;
        prof = created;
      }

      setProfile(prof);
      setPushEnabled(!!(await getPushSubscription()));
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      // 어떤 경로로든 반드시 로딩을 푼다 (무한 로딩 방지)
      setLoading(false);
    }
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

    await supabase.from("tasks")
      .update({ fixed_start_time: eveningPlanTime, fixed_end_time: addMinutes(eveningPlanTime, 20) })
      .eq("user_id", userId).eq("system_kind", "evening_plan");
    await supabase.from("tasks")
      .update({ fixed_start_time: morningBriefTime, fixed_end_time: addMinutes(morningBriefTime, 10) })
      .eq("user_id", userId).eq("system_kind", "morning_brief");
  };

  /* ── ICS 구독 피드 ─────────────────────────── */
  /** 새 토큰을 만든다. 이미 있으면 교체되어 예전 구독 주소는 더 이상 동작하지 않는다. */
  const createIcsToken = async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const { error: err } = await supabase.from("profiles").update({ ics_token: token }).eq("id", userId);
    if (err) throw err;
    setProfile((p) => (p ? { ...p, ics_token: token } : p));
  };

  const disableIcs = async () => {
    const { error: err } = await supabase.from("profiles").update({ ics_token: null }).eq("id", userId);
    if (err) throw err;
    setProfile((p) => (p ? { ...p, ics_token: null } : p));
  };

  const updateIcsTags = async (tags) => {
    setProfile((p) => (p ? { ...p, ics_tags: tags } : p));
    await supabase.from("profiles").update({ ics_tags: tags }).eq("id", userId);
  };

  /* ── Web Push 구독 ─────────────────────────── */
  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("이 브라우저는 푸시 알림을 지원하지 않아요.");
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("your-")) {
      throw new Error("VAPID 키가 아직 설정되지 않았어요. (.env의 VITE_VAPID_PUBLIC_KEY)");
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      throw new Error("알림은 배포된 주소(https)에서만 켤 수 있어요. 개발 서버에서는 동작하지 않습니다.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("알림 권한이 거부됐어요.");

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
    const sub = await getPushSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setPushEnabled(false);
  };

  return {
    profile, pushEnabled, loading, error,
    updateMaxDailyTasks, updateTimes,
    createIcsToken, disableIcs, updateIcsTags,
    enablePush, disablePush,
  };
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h * 60 + m + mins) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
