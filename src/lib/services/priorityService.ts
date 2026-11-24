// Purpose: gather the facts priority needs (who is affected, how credible) and call the pure rule. No tone, no text.
import "server-only";
import { userRepository, issueRepository, type Issue, type Priority, type TrustProfileRow } from "@/lib/db/repositories";
import { computePriority, type PriorityResult } from "@/lib/rules/priority";
import { trustWeight } from "@/lib/rules/trust";

type Weighted = { weight: number; capped: boolean };

/** Turn trust profiles into weights. An unknown user gets the most conservative weight. */
export function weightsFromProfiles(ids: string[], profiles: TrustProfileRow[]): Weighted[] {
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  return ids.map((id) => {
    const p = byId.get(id);
    const w = p ? trustWeight({ trustScore: p.trustScore, createdAt: p.createdAt, ledgerEvents: p.ledgerEvents }) : { weight: 0.5, capped: true };
    return { weight: w.weight, capped: w.capped };
  });
}

export async function weightsFor(userIds: string[]): Promise<Weighted[]> {
  return weightsFromProfiles(userIds, await userRepository.trustProfiles(userIds));
}

export async function computeFor(args: {
  category: string;
  hazard: { isHazard: boolean; type?: string | null };
  memberIds: string[];
}): Promise<PriorityResult> {
  const members = await weightsFor([...new Set(args.memberIds)]);
  return computePriority({ category: args.category, hazard: args.hazard, members });
}

export function hazardOf(issue: Issue): { isHazard: boolean; type: string | null } {
  const s = (issue.priorityBreakdown as { safety?: { isHazard?: boolean; type?: string | null } }).safety;
  return { isHazard: !!s?.isHazard, type: s?.type ?? null };
}

/** The voting pool of a round: every counted affected student and their CURRENT trust weight (frozen by the database). */
export async function poolFor(issueId: string): Promise<{ userId: string; weight: number }[]> {
  const profiles = await issueRepository.memberTrustProfiles(issueId);
  const ids = profiles.map((p) => p.userId);
  return weightsFromProfiles(ids, profiles).map((w, i) => ({ userId: ids[i], weight: w.weight }));
}

/**
 * Recompute an issue's priority from its COUNTED members (flagged reports no longer count). Idempotent; safe to call
 * after any membership or trust change. Two round trips: (issue + members) in parallel, then the write.
 */
export async function refreshIssuePriority(issueId: string, known?: Issue): Promise<Priority | null> {
  const [issue, profiles] = await Promise.all([known ? Promise.resolve(known) : issueRepository.getById(issueId), issueRepository.memberTrustProfiles(issueId)]);
  if (!issue || profiles.length === 0) return issue?.priority ?? null;
  const members = weightsFromProfiles(
    profiles.map((p) => p.userId),
    profiles,
  );
  const r = computePriority({ category: issue.category, hazard: hazardOf(issue), members });
  // keep the routing note that was stored with the original breakdown
  const routing = (issue.priorityBreakdown as { routing?: unknown }).routing;
  const breakdown = { ...(r.breakdown as unknown as Record<string, unknown>), ...(routing ? { routing } : {}) };
  await issueRepository.updatePriority(issueId, { priority: r.tier, score: r.score, breakdown });
  return r.tier;
}
