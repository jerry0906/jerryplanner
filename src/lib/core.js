/* 시간축 상수 — Allocator / Today 타임라인이 공유 */
export const DAY_START = 6 * 60;    // 06:00
export const DAY_END = 23 * 60;     // 23:00
export const PX_PER_MIN = 56 / 60;  // 1시간 = 56px
export const SNAP = 15;             // 15분 스냅
export const DEFAULT_DUR = 60;      // 배정 시 기본 1시간

export const minToY = (m) => (m - DAY_START) * PX_PER_MIN;

export const yToMin = (y) => {
  const snapped = Math.round((DAY_START + y / PX_PER_MIN) / SNAP) * SNAP;
  return Math.max(DAY_START, Math.min(DAY_END - SNAP, snapped));
};

export const fmt = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const durLabel = (m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
};

/* "09:30:00" ↔ 570 */
export const timeToMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};
export const minToTime = (m) =>
  m == null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ── 도메인 상수 ──────────────────────────────── */
export const TAGS = {
  personal: { label: "Personal", chip: "bg-sky-100 text-sky-700", solid: "bg-sky-500", border: "border-l-sky-500" },
  work:     { label: "Work",     chip: "bg-amber-100 text-amber-700", solid: "bg-amber-500", border: "border-l-amber-500" },
  social:   { label: "Social",   chip: "bg-fuchsia-100 text-fuchsia-700", solid: "bg-fuchsia-500", border: "border-l-fuchsia-500" },
  admin:    { label: "Admin",    chip: "bg-slate-200 text-slate-600", solid: "bg-slate-400", border: "border-l-slate-400" },
  ltg:      { label: "LTG",      chip: "bg-emerald-100 text-emerald-700", solid: "bg-emerald-500", border: "border-l-emerald-500" },
};
export const TAG_KEYS = Object.keys(TAGS);

export const REPEAT_OPTIONS = [
  { key: "none", label: "None" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "custom_days", label: "Custom" },
];

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/* 반복 태스크가 오늘 해당되는지 */
export function repeatsOn(task, dateISO) {
  if (task.repeat_rule === "none") return false;
  const dow = new Date(dateISO + "T00:00:00").getDay();
  if (task.repeat_rule === "daily") return true;
  if (task.repeat_rule === "custom_days") return (task.days_of_week || []).includes(dow);
  if (task.repeat_rule === "weekly") {
    const anchor = new Date(task.created_at || dateISO).getDay();
    return dow === anchor;
  }
  return false;
}
