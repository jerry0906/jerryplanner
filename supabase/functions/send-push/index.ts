// supabase/functions/send-push/index.ts
// 본인에게 테스트 알림을 보낼 때 사용. (실제 예약 발송은 notify-cron이 담당)

import { cors, json, requireUser, serviceClient } from "../_shared.ts";
import { sendPushToUser } from "../_push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = await requireUser(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const { title, body } = await req.json().catch(() => ({}));
  const result = await sendPushToUser(serviceClient(), auth.user.id, {
    title: title ?? "테스트 알림",
    body: body ?? "알림이 정상적으로 도착했어요.",
  });

  return json(result);
});
