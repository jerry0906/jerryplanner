// supabase/functions/outlook-auth-callback/index.ts
//
// Microsoft가 code와 state(user_id)를 붙여 이 URL로 리다이렉트한다.
// code를 토큰으로 교환한 뒤 refresh_token만 저장하고, 앱으로 돌려보낸다.

import { cors, serviceClient } from "../_shared.ts";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const appUrl = Deno.env.get("APP_URL") ?? "/";

  if (!code || !userId) {
    return htmlResult(false, "인증 코드가 없습니다.", appUrl);
  }

  const body = new URLSearchParams({
    client_id: Deno.env.get("MS_CLIENT_ID")!,
    client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
    redirect_uri: Deno.env.get("MS_REDIRECT_URI")!,
    grant_type: "authorization_code",
    code,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    console.error(await tokenRes.text());
    return htmlResult(false, "토큰 교환에 실패했습니다.", appUrl);
  }

  const tokens = await tokenRes.json();

  // 계정 이메일 확인 (표시용)
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const me = meRes.ok ? await meRes.json() : {};

  const supabase = serviceClient();
  const { error } = await supabase.from("outlook_connections").upsert({
    user_id: userId,
    refresh_token: tokens.refresh_token,
    account_email: me.mail ?? me.userPrincipalName ?? null,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error(error);
    return htmlResult(false, "연동 정보를 저장하지 못했습니다.", appUrl);
  }

  return htmlResult(true, "Outlook 계정이 연결되었습니다.", appUrl);
});

/** 팝업/리다이렉트 흐름 둘 다 대응: 부모 창이 있으면 알리고 닫고, 없으면 앱으로 이동 */
function htmlResult(ok: boolean, message: string, appUrl: string) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:80px;">
      <p>${message}</p>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: "outlook-auth", ok: ${ok} }, "*");
          window.close();
        } else {
          location.href = "${appUrl}";
        }
      </script>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
