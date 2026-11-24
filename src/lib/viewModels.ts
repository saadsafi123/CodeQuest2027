// Purpose: pure helpers that turn the issue summaries a viewer is ALREADY allowed to see into dashboard numbers
// (a 14-day trend, load per department, hot places). No data access and no decisions: it only counts what it is given.
import { departmentName } from "./departments";
import type { BarItem } from "@/components/ui/charts";
import type { IssueSummary } from "./services/issueService";

type Dated = { createdAt: string };

export const isActive = (i: Pick<IssueSummary, "status">) => i.status === "open" || i.status === "reopened" || i.status === "in_progress";

/** One count per day for the last `days` days (oldest first), by an ISO date field. */
export function dailyCounts<T>(items: T[], pick: (t: T) => string | null | undefined, days = 14, now: number = Date.now()): number[] {
  const DAY = 86_400_000;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const out = Array.from({ length: days }, () => 0);
  for (const it of items) {
    const iso = pick(it);
    if (!iso) continue;
    const idx = days - 1 - Math.floor((startOfToday - new Date(iso).setHours(0, 0, 0, 0)) / DAY);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}

export const createdSeries = (issues: Dated[], days = 14, now?: number) => dailyCounts(issues, (i) => i.createdAt, days, now);
export const resolvedSeries = (issues: IssueSummary[], days = 14, now?: number) =>
  dailyCounts(issues.filter((i) => i.status === "resolved" || i.status === "closed"), (i) => i.updatedAt, days, now);

const TONES: NonNullable<BarItem["tone"]>[] = ["brand", "info", "accent", "warn", "ok"];

/** Active issues per department (admin overview). Issues nobody owns are shown as "Needs a department". */
export function departmentLoad(issues: IssueSummary[]): BarItem[] {
  const map = new Map<string, number>();
  for (const i of issues.filter(isActive)) {
    const k = i.department ?? "none";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n], idx) => ({ label: k === "none" ? "Needs a department" : departmentName(k), value: n, note: `${n} active`, tone: k === "none" ? "warn" : TONES[idx % TONES.length] }));
}

/** Places with the most active issues. */
export function hotPlaces(issues: IssueSummary[], limit = 5): BarItem[] {
  const map = new Map<string, { n: number; students: number; critical: boolean }>();
  for (const i of issues.filter(isActive)) {
    if (!i.location) continue;
    const cur = map.get(i.location.name) ?? { n: 0, students: 0, critical: false };
    cur.n++;
    cur.students += i.meToo;
    cur.critical ||= i.priority === "critical";
    map.set(i.location.name, cur);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].students - a[1].students)
    .slice(0, limit)
    .map(([name, v]) => ({ label: name, value: v.n, note: `${v.n} ${v.n === 1 ? "issue" : "issues"} · ${v.students} affected`, tone: v.critical ? "danger" : "brand" }));
}

/** Age of the oldest issue still waiting for staff, in hours (null when nothing waits). */
export function oldestWaitingHours(issues: IssueSummary[], now: number = Date.now()): number | null {
  const waiting = issues.filter((i) => i.status === "open" || i.status === "reopened");
  if (waiting.length === 0) return null;
  return Math.max(...waiting.map((i) => (now - new Date(i.createdAt).getTime()) / 3_600_000));
}
