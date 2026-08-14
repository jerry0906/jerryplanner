import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !anonKey) {
  throw new Error(".env 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정해 주세요.");
}

export const supabase = createClient(SUPABASE_URL, anonKey);

/**
 * 로그인 토큰을 실어 Edge Function을 호출하는 공용 헬퍼.
 * Anthropic API 키, MS 클라이언트 시크릿, VAPID 개인키는 전부 서버(Edge Function)에만
 * 있고 이 앱 번들에는 절대 포함되지 않는다.
 */
export async function callFn(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const ai = {
  /** 장기 목표 → 하위 과업 초안 (Sonnet) */
  breakdown: (title, dueDate, existing = [], outcome = "") =>
    callFn("ai", { action: "ltg_breakdown", payload: { title, due_date: dueDate, existing, outcome } }),

  /** 캡처된 할 일 → type_tag / category 자동 분류 (Haiku) */
  classify: (title) => callFn("ai", { action: "classify_task", payload: { title } }),
};

export const outlook = {
  /** 팝업으로 Microsoft 로그인을 띄우고, 완료되면 resolve 된다. */
  connect: (userId) =>
    new Promise((resolve, reject) => {
      const popup = window.open(
        `${SUPABASE_URL}/functions/v1/outlook-auth-start?user_id=${userId}`,
        "outlook-connect",
        "width=480,height=640",
      );
      if (!popup) return reject(new Error("팝업이 차단됐어요. 팝업 허용 후 다시 시도해 주세요."));

      const onMessage = (e) => {
        if (e.data?.type !== "outlook-auth") return;
        window.removeEventListener("message", onMessage);
        e.data.ok ? resolve() : reject(new Error("연결에 실패했어요."));
      };
      window.addEventListener("message", onMessage);
    }),

  /** 지정한 날짜의 배정 일정을 Outlook으로 push */
  push: (date) => callFn("outlook-push", { date }),
};

export const push = {
  sendTest: (title, body) => callFn("send-push", { title, body }),
};
