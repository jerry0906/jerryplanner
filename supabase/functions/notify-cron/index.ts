// supabase/functions/notify-cron/index.ts
//
// pg_cron이 5분 간격으로 호출한다 (schema.sql 맨 아래 cron.schedule 참고).
// "지금이 evening_plan_time / morning_brief_time 을 막 지난 시점"인 유저를 찾아
// 오늘 아직 안 보냈으면(notification_log) 딱 한 번 보낸다.

import { cors, json, serviceClient } from "../_shared.ts";
import { sendPushToUser } from "../_push.ts";

const WINDOW_MIN = 5; // pg_cron 주기와 맞춘다

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = serviceClient();
  const now = new Date();
  const kstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const today = kstNow.toISOString().slice(0, 10);
  const nowMinutes = kstNow.getHours() * 60 + kstNow.getMinutes();

  const kinds: Array<{ kind: "evening_plan" | "morning_brief"; column: string; title: string; body: string }> = [
    { kind: "evening_plan", column: "evening_plan_time", title: "저녁 계획 세울 시간이에요", body: "내일 할 일을 Allocator에서 배정해 보세요." },
    { kind: "morning_brief", column: "morning_brief_time", title: "오늘의 브리핑", body: "오늘 배정된 일정을 Today에서 확인하세요." },
  ];

  let sentCount = 0;
  const errors: string[] = [];

  for (const { kind, column, title, body } of kinds) {
    const { data: profiles, error } = await admin.from("profiles").select(`id, ${column}`);
    if (error) { errors.push(error.message); continue; }

    for (const p of profiles ?? []) {
      const timeStr = (p as Record<string, string>)[column]; // "21:00:00"
      if (!timeStr) continue;
      const [h, m] = timeStr.split(":").map(Number);
      const targetMinutes = h * 60 + m;

      // 알림 시각을 막 지났는지 (윈도우 안에 들어왔는지)
      if (nowMinutes < targetMinutes || nowMinutes >= targetMinutes + WINDOW_MIN) continue;

      // 오늘 이미 보냈으면 건너뛴다
      const { data: already } = await admin
        .from("notification_log")
        .select("user_id")
        .eq("user_id", p.id).eq("date", today).eq("kind", kind)
        .maybeSingle();
      if (already) continue;

      try {
        const result = await sendPushToUser(admin, p.id, { title, body });
        await admin.from("notification_log").insert({ user_id: p.id, date: today, kind });
        sentCount += result.sent;
      } catch (e) {
        errors.push(`${p.id}/${kind}: ${e}`);
      }
    }
  }

  return json({ sent: sentCount, errors });
});
