// supabase/functions/ai/index.ts
//
// Claude API 프록시. API 키는 이 서버에만 존재하며
// 앱 번들에는 절대 포함되지 않는다.
//
// 배포:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai

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

/**
 * Claude를 호출하고 JSON만 뽑아낸다.
 * 모델이 앞뒤로 설명이나 코드펜스를 붙이는 경우가 있어 가장 바깥 JSON만 잘라낸다.
 */
async function askForJSON(model: string, prompt: string) {
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
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.content
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("")
    .trim();

  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`JSON을 찾지 못했습니다: ${cleaned.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

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

    // ── ① LTG Breakdown (품질이 중요하므로 Sonnet) ─────────
    if (action === "ltg_breakdown") {
      const { title, due_date, outcome = "", existing = [] } = payload;

      const prompt = `장기 목표를 실행 가능한 하위 과업으로 분해해줘.

목표: "${title}"
달성 목표일: ${due_date}
${outcome ? `달성하고자 하는 최종 상태:\n${outcome}` : ""}
${existing.length ? `이미 등록된 과업 (중복 피할 것): ${existing.join(", ")}` : ""}

조건:
- 위에 적힌 "최종 상태"에 실제로 도달하는 데 필요한 일들로 구성할 것
- 각 과업은 한 번에 1~2시간 안에 끝낼 수 있는 구체적 단위
- 모호한 표현 대신 첫 행동이 무엇인지 분명하게
- 목표일까지 남은 기간을 고려해 6~8개 제안

반드시 아래 JSON 형식으로만 답해. 다른 설명이나 마크다운 없이 JSON만:
{"subtasks":[{"title":"과업 제목","estimated_minutes":90}]}`;

      return json(await askForJSON("claude-sonnet-4-6", prompt));
    }

    // ── ② 캡처된 태스크 자동 분류 (저렴한 Haiku) ───────────
    if (action === "classify_task") {
      const { title } = payload;

      const prompt = `할 일의 유형을 분류해줘.

할 일: "${title}"

type_tag 기준:
- personal: 개인 생활, 건강, 취미
- work: 업무, 직무 관련
- social: 사람 만나기, 연락, 경조사
- admin: 행정, 서류, 결제, 예약 등 처리성 업무
- ltg: 장기 목표와 직접 연결된 일

반드시 아래 JSON 형식으로만 답해. 다른 설명 없이 JSON만:
{"type_tag":"work"}`;

      return json(await askForJSON("claude-haiku-4-5-20251001", prompt));
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
