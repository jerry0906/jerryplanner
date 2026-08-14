// ============================================================
//  supabase/functions/ai/index.ts
//
//  Claude API 프록시. API 키는 이 서버에만 존재하며
//  Android 앱에는 절대 포함되지 않는다.
//
//  배포:
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//    supabase functions deploy ai
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/* ── Claude 호출 (Structured Outputs로 스키마 강제) ────────── */
async function callClaude(
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: { type: "json_schema", schema } },
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.content
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
  return JSON.parse(text);
}

/* ── 스키마 정의 ──────────────────────────────────────────── */
const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          estimated_minutes: { type: "integer" },
        },
        required: ["title", "estimated_minutes"],
      },
    },
  },
  required: ["subtasks"],
};

const TAG_SCHEMA = {
  type: "object",
  properties: {
    type_tag: { type: "string", enum: ["personal", "work", "social", "admin", "ltg"] },
    category: { type: "string", enum: ["today", "followup_delegated", "later"] },
  },
  required: ["type_tag", "category"],
};

/* ── 핸들러 ───────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 인증 확인 — 로그인한 사용자만 호출 가능
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  try {
    const { action, payload } = await req.json();

    // ── ① LTG Breakdown ───────────────────────────────────
    //  품질이 중요하므로 Sonnet 사용
    if (action === "ltg_breakdown") {
      const { title, due_date, existing = [] } = payload;

      const prompt = `장기 목표를 실행 가능한 하위 과업으로 분해해줘.

목표: "${title}"
기한: ${due_date}
${existing.length ? `이미 등록된 과업 (중복 피할 것): ${existing.join(", ")}` : ""}

조건:
- 각 과업은 한 번에 1~2시간 안에 끝낼 수 있는 구체적 단위
- 모호한 표현 대신 첫 행동이 무엇인지 분명하게
- 기한까지 남은 기간을 고려해 6~8개 제안`;

      const result = await callClaude("claude-sonnet-4-6", prompt, BREAKDOWN_SCHEMA);
      return json(result);
    }

    // ── ② 캡처된 태스크 자동 분류 ─────────────────────────
    //  단순 분류이므로 저렴한 Haiku 사용
    if (action === "classify_task") {
      const { title } = payload;

      const prompt = `할 일을 분류해줘.

할 일: "${title}"

type_tag 기준:
- personal: 개인 생활, 건강, 취미
- work: 업무, 직무 관련
- social: 사람 만나기, 연락, 경조사
- admin: 행정, 서류, 결제, 예약 등 처리성 업무
- ltg: 장기 목표와 직접 연결된 일

category 기준:
- today: 곧 직접 처리할 일
- followup_delegated: 남에게 맡겼거나 회신을 기다리는 일
- later: 급하지 않아 미뤄둘 일`;

      const result = await callClaude("claude-haiku-4-5-20251001", prompt, TAG_SCHEMA);
      return json(result);
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
