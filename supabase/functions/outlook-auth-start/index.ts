// supabase/functions/outlook-auth-start/index.ts
//
// 앱에서 이 URL로 이동시키면 Microsoft 로그인 화면을 거쳐
// outlook-auth-callback 으로 code와 함께 돌아온다.
//
// 필요한 secrets:
//   supabase secrets set MS_CLIENT_ID=... MS_CLIENT_SECRET=... MS_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/outlook-auth-callback

import { cors } from "../_shared.ts";

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const SCOPE = "offline_access Calendars.ReadWrite";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("user_id 파라미터가 필요합니다.", { status: 400, headers: cors });

  const params = new URLSearchParams({
    client_id: Deno.env.get("MS_CLIENT_ID")!,
    response_type: "code",
    redirect_uri: Deno.env.get("MS_REDIRECT_URI")!,
    response_mode: "query",
    scope: SCOPE,
    // state에 user_id를 실어 보내고, 콜백에서 그대로 받아 어느 유저 것인지 식별한다.
    state: userId,
  });

  return Response.redirect(`${AUTHORIZE_URL}?${params.toString()}`, 302);
});
