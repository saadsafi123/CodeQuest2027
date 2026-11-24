// Purpose: the trending board ranking (bonus). Pure and deterministic: no AI, no text, no names.
// Hot = important (priority) + many DIFFERENT affected students (crowd, diminishing returns) + recent activity.
// Priority already comes from impact only (rules/priority.ts), so tone or one loud student cannot make something trend.
import { config } from "@/lib/config";

export interface TrendInput {
  priority: string;
  status: string;
  meToo: number;
  createdAt: string;
  updatedAt: string;
  confidential: boolean;
}

export interface Trending<T> {
  issue: T;
  score: number;
  /** New and already shared by several students. */
  rising: boolean;
}

const hoursSince = (iso: string, now: Date) => Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000);

export function trendScore(i: TrendInput, now: Date = new Date()): number {
  const t = config.trending;
  const base = t.priorityPoints[i.priority] ?? 1;
  const crowd = t.crowdFactor * Math.sqrt(Math.max(1, i.meToo));
  const recency = Math.pow(0.5, hoursSince(i.updatedAt, now) / t.halfLifeHours);
  return (base + crowd) * (0.25 + 0.75 * recency);
}

/** Highest first. Confidential and closed issues never trend. */
export function rankTrending<T extends TrendInput>(issues: T[], now: Date = new Date(), limit: number = config.trending.limit): Trending<T>[] {
  const t = config.trending;
  return issues
    .filter((i) => !i.confidential && i.status !== "closed")
    .map((issue) => ({
      issue,
      score: Math.round(trendScore(issue, now) * 100) / 100,
      rising: hoursSince(issue.createdAt, now) <= t.risingMaxAgeHours && issue.meToo >= t.risingMinStudents,
    }))
    .sort((a, b) => b.score - a.score || b.issue.meToo - a.issue.meToo)
    .slice(0, limit);
}
