// Purpose: tiny display helpers shared by pages (no business logic).
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };

/** "24 Nov 2026". One date format everywhere. `timeZone` is for tests; the UI uses the viewer's zone. */
export function formatDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { ...DATE_OPTS, timeZone }).format(new Date(iso));
}

/** "24 Nov 2026, 14:05". */
export function formatDateTime(iso: string, timeZone?: string): string {
  return `${formatDate(iso, timeZone)}, ${new Intl.DateTimeFormat("en-GB", { ...TIME_OPTS, timeZone }).format(new Date(iso))}`;
}

/** Recent -> "5 min ago", older than a week -> the date. Used for "last updated" columns. */
export function formatUpdated(iso: string, now: number = Date.now(), timeZone?: string): string {
  return now - new Date(iso).getTime() > 7 * 86_400_000 ? formatDate(iso, timeZone) : timeAgo(iso, now);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Department names live in src/data/departments.json (read through src/lib/departments.ts).
export { DEPARTMENT_NAMES } from "./departments";
