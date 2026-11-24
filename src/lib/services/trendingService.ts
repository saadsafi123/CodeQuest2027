// Purpose: the trending board. Any signed-in user may read it: it lists only NON-confidential issues, with no student
// identities (just titles, places, priority and how many students are affected).
import "server-only";
import { issueRepository, type User } from "@/lib/db/repositories";
import { rankTrending } from "@/lib/rules/trending";
import { ServiceError } from "./errors";
import { toSummary, type IssueSummary } from "./issueService";

export interface TrendingItem {
  issue: IssueSummary;
  score: number;
  rising: boolean;
}

export async function listTrending(user: User | null): Promise<TrendingItem[]> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  const rows = await issueRepository.listPublic(); // never includes confidential issues
  const summaries = rows.filter((i) => !i.isConfidential).map((i) => toSummary(i, null, null));
  return rankTrending(summaries).map((t) => ({ issue: t.issue, score: t.score, rising: t.rising }));
}
