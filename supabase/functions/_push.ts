// supabase/functions/_push.ts
//
// VAPID 키는 한 번만 생성해서 secrets로 등록한다.
//   npx web-push generate-vapid-keys
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//
// VAPID_PUBLIC_KEY는 클라이언트(PushManager.subscribe)에도 그대로 필요하므로
// .env의 VITE_VAPID_PUBLIC_KEY에도 동일한 값을 넣는다.

import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

/**
 * 특정 유저의 모든 구독 기기에 알림을 보낸다.
 * 만료된 구독(410/404)은 자동으로 지운다.
 */
export async function sendPushToUser(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || subs.length === 0) return { sent: 0 };

  let sent = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("push failed", sub.id, err);
      }
    }
  }));

  return { sent };
}
