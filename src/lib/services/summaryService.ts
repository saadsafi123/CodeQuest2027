// Purpose: the AI-written admin summary (admin only). Facts are computed here from non-confidential issues; confidential
// reports are only counted. The result is cached briefly so refreshing the page does not call the AI every time.
import "server-only";
import { generateAdminSummary, type SummaryFacts, type SummaryResult } from "@/lib/ai/summary";
import { config } from "@/lib/config";
import type { User } from "@/lib/db/repositories";
import { isAdmin } from "@/lib/rules/permissions";
import { rankTrending } from "@/lib/rules/trending";
import { ServiceError } from "./errors";
import { adminOverview } from "./issueService";

export interface AdminSummaryView extends SummaryResult {
  generatedAt: string;
}

type Cached = { at: number; value: AdminSummaryView };
const holder = () => globalThis as { __rfSummary?: Cached };

function count<T>(xs: T[], key: (x: T) => string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = key(x);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Tests only. */
export function clearSummaryCache(): void {
  holder().__rfSummary = undefined;
}

export async function adminSummary(user: User | null, opts: { refresh?: boolean } = {}): Promise<AdminSummaryView> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  if (!isAdmin(user)) throw new ServiceError("forbidden", "Only the admin can see the summary.");
  const hit = holder().__rfSummary;
  if (!opts.refresh && hit && Date.now() - hit.at < config.summary.cacheSeconds * 1000) return hit.value;

  const o = await adminOverview(user); // non-confidential issues only; confidential is just a count
  const active = o.issues.filter((i) => i.status !== "closed");
  const facts: SummaryFacts = {
    total: o.issues.length,
    byStatus: count(o.issues, (i) => i.status),
    byPriority: count(active, (i) => i.priority),
    byDepartment: count(active, (i) => i.department),
    needsDepartment: o.stats.needsDepartment,
    awaitingPlace: o.stats.awaitingPlace,
    confidentialCount: o.stats.confidential,
    top: rankTrending(o.issues, new Date(), config.summary.topIssues).map((t) => ({
      title: t.issue.title,
      place: t.issue.location?.name ?? null,
      department: t.issue.department,
      priority: t.issue.priority,
      status: t.issue.status,
      students: t.issue.meToo,
    })),
    reopened: o.issues.filter((i) => i.status === "reopened").map((i) => ({ title: i.title, place: i.location?.name ?? null })),
  };
  const value: AdminSummaryView = { ...(await generateAdminSummary(facts)), generatedAt: new Date().toISOString() };
  holder().__rfSummary = { at: Date.now(), value };
  return value;
}
