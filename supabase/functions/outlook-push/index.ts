// supabase/functions/outlook-push/index.ts
//
// Allocator에서 "저장 & Outlook으로 전송"을 누르면 호출된다.
// (전달받은 date의 schedule_entries 중 push_tags에 해당하는 태그만 Outlook에 반영)
//
// 일방향(App → Outlook)만 지원한다. Outlook 쪽 기존 일정은 건드리지 않는다.

import { cors, json, requireUser, serviceClient } from "../_shared.ts";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = await requireUser(req);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const { user } = auth;

  const { date } = await req.json();
  if (!date) return json({ error: "date가 필요합니다." }, 400);

  const admin = serviceClient();

  const { data: conn } = await admin.from("outlook_connections").select("*").eq("user_id", user.id).single();
  if (!conn || !conn.is_enabled) {
    return json({ error: "Outlook이 연결되어 있지 않거나 꺼져 있어요. 설정에서 먼저 연결해 주세요." }, 400);
  }

  const { data: entries } = await admin
    .from("schedule_entries")
    .select("*, tasks(*)")
    .eq("user_id", user.id)
    .eq("date", date)
    .eq("is_skipped", false);

  const targets = (entries ?? []).filter((e) => conn.push_tags.includes(e.tasks?.type_tag));
  if (targets.length === 0) return json({ pushed: 0, message: "Push 대상 태그의 일정이 없어요." });

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(conn.refresh_token);
  } catch (e) {
    return json({ error: `Outlook 인증이 만료됐어요. 설정에서 다시 연결해 주세요. (${e})` }, 401);
  }

  let pushed = 0;
  const errors: string[] = [];

  for (const entry of targets) {
    try {
      const eventId = await upsertEvent(accessToken, date, entry, entry.tasks);
      if (eventId && eventId !== entry.outlook_event_id) {
        await admin.from("schedule_entries").update({ outlook_event_id: eventId }).eq("id", entry.id);
      }
      pushed++;
    } catch (e) {
      errors.push(`${entry.tasks?.title ?? entry.id}: ${e}`);
    }
  }

  return json({ pushed, total: targets.length, errors });
});

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: Deno.env.get("MS_CLIENT_ID")!,
    client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "offline_access Calendars.ReadWrite",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.access_token as string;
}

function toISO(date: string, minute: number) {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return `${date}T${h}:${m}:00`;
}

async function upsertEvent(
  accessToken: string,
  date: string,
  entry: { start_minute: number; duration_minutes: number; outlook_event_id: string | null },
  task: { title: string; type_tag: string },
) {
  const payload = {
    subject: task.title,
    start: { dateTime: toISO(date, entry.start_minute), timeZone: "Asia/Seoul" },
    end: { dateTime: toISO(date, entry.start_minute + entry.duration_minutes), timeZone: "Asia/Seoul" },
    showAs: "busy",
    categories: [task.type_tag],
  };

  const url = entry.outlook_event_id
    ? `${GRAPH}/me/events/${entry.outlook_event_id}`
    : `${GRAPH}/me/events`;

  const res = await fetch(url, {
    method: entry.outlook_event_id ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // 이미 지워진 이벤트를 갱신하려 하면 404가 온다 → 새로 생성
  if (res.status === 404 && entry.outlook_event_id) {
    const retry = await fetch(`${GRAPH}/me/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!retry.ok) throw new Error(await retry.text());
    return (await retry.json()).id as string;
  }

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).id as string;
}
