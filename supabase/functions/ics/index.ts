// supabase/functions/ics/index.ts
//
// Outlook / Google / Apple 캘린더의 "인터넷 일정 구독"이 주기적으로 읽어 가는 ICS 피드.
//   GET https://<project-ref>.supabase.co/functions/v1/ics/<ics_token>.ics
//
// 캘린더 앱은 로그인·쿠키를 못 다루므로 JWT 검증 없이 배포한다(--no-verify-jwt).
// 대신 URL에 든 추측 불가능한 토큰(profiles.ics_token)으로 사용자를 찾는다.
// 토큰을 다시 만들면 예전 URL은 즉시 404가 된다.
//
// 내보내는 것 (profiles.ics_tags에 해당하는 태그만):
//   - 배정된 일정(schedule_entries): 오늘 기준 -30일 ~ +90일
//   - 루틴(repeat_rule <> 'none'): RRULE 반복 일정 하나로
// 일정마다 UID를 고정해서, 캘린더가 다시 읽어도 중복되지 않고 갱신된다.

import { serviceClient } from "../_shared.ts";

const TZID = "Asia/Seoul";
const PAST_DAYS = 30;
const FUTURE_DAYS = 90;
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });

  const token = new URL(req.url).pathname.split("/").pop()?.replace(/\.ics$/, "") ?? "";
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return new Response("not found", { status: 404 });

  const admin = serviceClient();
  const { data: profile } = await admin
    .from("profiles").select("id, ics_tags").eq("ics_token", token).maybeSingle();
  if (!profile) return new Response("not found", { status: 404 });

  const tags: string[] = profile.ics_tags ?? [];
  const today = kstToday();

  const [{ data: entries }, { data: routines }] = await Promise.all([
    admin.from("schedule_entries")
      .select("id, date, start_minute, duration_minutes, actual_duration, tasks!inner(title, type_tag)")
      .eq("user_id", profile.id)
      .eq("is_skipped", false)
      .gte("date", shiftDate(today, -PAST_DAYS))
      .lte("date", shiftDate(today, FUTURE_DAYS))
      .in("tasks.type_tag", tags.length ? tags : ["__none__"]),
    admin.from("tasks")
      .select("id, title, type_tag, repeat_rule, days_of_week, fixed_start_time, fixed_end_time, created_at")
      .eq("user_id", profile.id)
      .neq("repeat_rule", "none")
      .neq("status", "done")
      .in("type_tag", tags.length ? tags : ["__none__"]),
  ]);

  const stamp = utcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jerry Planner//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Jerry Planner",
    `X-WR-TIMEZONE:${TZID}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // 한국은 서머타임이 없어 고정 +09:00 하나면 된다
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const e of entries ?? []) {
    const task = e.tasks as unknown as { title: string; type_tag: string };
    const done = e.actual_duration != null;
    lines.push(
      "BEGIN:VEVENT",
      `UID:entry-${e.id}@jerryplanner`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZID}:${localStamp(e.date, e.start_minute)}`,
      `DTEND;TZID=${TZID}:${localStamp(e.date, e.start_minute + e.duration_minutes)}`,
      `SUMMARY:${escapeText((done ? "✓ " : "") + task.title)}`,
      `CATEGORIES:${escapeText(task.type_tag)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  for (const t of routines ?? []) {
    const start = toMinute(t.fixed_start_time);
    const end = toMinute(t.fixed_end_time);
    if (start == null || end == null) continue;

    // 시작일은 루틴을 만든 날. weekly는 그 요일에 반복된다 (앱의 repeatsOn과 같은 규칙).
    const anchor = kstDate(new Date(t.created_at));
    let rrule = "FREQ=DAILY";
    let first = anchor;
    if (t.repeat_rule === "weekly") {
      rrule = "FREQ=WEEKLY";
    } else if (t.repeat_rule === "custom_days") {
      const days: number[] = t.days_of_week ?? [];
      if (days.length === 0) continue;
      rrule = `FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(",")}`;
      // DTSTART는 반복 규칙에 맞는 첫 날이어야 캘린더 앱이 헷갈리지 않는다
      while (!days.includes(new Date(first + "T00:00:00Z").getUTCDay())) first = shiftDate(first, 1);
    }

    lines.push(
      "BEGIN:VEVENT",
      `UID:routine-${t.id}@jerryplanner`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZID}:${localStamp(first, start)}`,
      `DTEND;TZID=${TZID}:${localStamp(first, end > start ? end : start + 30)}`,
      `RRULE:${rrule}`,
      `SUMMARY:${escapeText("↻ " + t.title)}`,
      `CATEGORIES:${escapeText(t.type_tag)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="jerryplanner.ics"',
      "Cache-Control": "no-cache",
    },
  });
});

/* ── 날짜/시간 ──────────────────────────────────────────── */

/** Date → KST 기준 "YYYY-MM-DD" */
function kstDate(d: Date) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
const kstToday = () => kstDate(new Date());

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ("2026-10-23", 570) → "20261023T093000". 자정을 넘는 분은 다음 날로 넘긴다. */
function localStamp(iso: string, minute: number) {
  const day = shiftDate(iso, Math.floor(minute / 1440));
  const m = ((minute % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${day.replaceAll("-", "")}T${hh}${mm}00`;
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** "09:30:00" → 570 */
function toMinute(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/* ── RFC 5545 텍스트 규칙 ───────────────────────────────── */

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** 한 줄은 75바이트 이하. 넘으면 CRLF + 공백으로 접는다 (한글이 깨지지 않게 글자 단위로). */
function fold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // 이어지는 줄은 맨 앞 공백 1바이트 포함
    if (bytes + b > limit) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
