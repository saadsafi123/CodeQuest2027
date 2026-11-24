// Purpose: grouping decisions (R2). Same canonical place + same problem = ONE issue ("me too"); a different
// problem at the same place stays separate. Code decides WHICH issues are candidates and whether a verdict is
// acceptable; the semantic "same problem?" verdict itself comes from ai/compare.ts (AI, with a rule-based fallback).
import { config } from "@/lib/config";
import { assertNotConfidential } from "./confidentiality";

export interface GroupableIssue {
  id: string;
  canonicalLocation: string | null;
  status: string;
  isConfidential: boolean;
  /** Was a safety hazard flagged on this issue? */
  isHazard: boolean;
  signature: string;
  category: string;
  oneLineReason: string | null;
}

/**
 * Candidates for joining: same canonical location, not confidential, not closed.
 * "resolved" issues stay joinable (D15): a student who still has the problem joins it and can dispute the fix.
 */
export function selectCandidates<T extends GroupableIssue>(issues: T[], locationId: string | null): T[] {
  if (!locationId) return [];
  return issues
    .filter((i) => !i.isConfidential && i.canonicalLocation === locationId && i.status !== "closed")
    .slice(0, config.grouping.maxCandidates);
}

/**
 * Accept or reject a verdict. A hazard report and a non-hazard issue are never the same problem
 * (e.g. "AC sparking" vs "AC not cooling"), whatever the AI said: code wins.
 */
export function acceptVerdict<T extends GroupableIssue>(
  chosen: T | null,
  report: { isHazard: boolean; confidential: boolean },
): T | null {
  if (report.confidential) return null; // confidential reports are never grouped (D19)
  if (!chosen) return null;
  assertNotConfidential(chosen, "grouping");
  if (chosen.isHazard !== report.isHazard) return null;
  return chosen;
}
