// Purpose: deterministic priority from IMPACT only (R3, R9). Only code sets priority; the AI never does.
// Inputs deliberately exclude the report text: capital letters, "!!!" and the word "urgent" cannot matter.
//  1. any safety hazard -> critical (always)
//  2. otherwise start from the category's base severity
//  3. crowd: weights of the distinct affected students, each capped per person, with diminishing returns
//     -> +0/+1/+2 tiers, never above config.priority.crowdMaxTier
//  4. a single affected student can never lift a non-hazard issue above "medium" (one person, however trusted, is not a crowd)
import { config, type PriorityTier } from "@/lib/config";

const TIERS = config.priority.tiers;
const level = (t: PriorityTier) => TIERS.indexOf(t);

export interface PriorityInput {
  category: string;
  hazard: { isHazard: boolean; type?: string | null };
  /** One entry per DISTINCT affected student (reporters + joiners). */
  members: { weight: number; capped?: boolean }[];
}

export interface PriorityBreakdown {
  version: 1;
  tier: PriorityTier;
  base: { category: string; tier: PriorityTier };
  safety: { isHazard: boolean; type: string | null; forced: boolean };
  crowd: {
    distinctStudents: number;
    score: number;
    bonusTiers: number;
    perPersonCap: number;
    cappedAccounts: number;
    singleStudentClamp: boolean;
  };
  ignored: string[];
  explanation: string[];
}

export interface PriorityResult {
  tier: PriorityTier;
  /** Sortable number: higher = more important. */
  score: number;
  breakdown: PriorityBreakdown;
}

export function crowdScore(weights: number[]): number {
  const cap = config.crowd.perPersonWeightCap;
  const sorted = weights.map((w) => Math.min(Math.max(w, 0), cap)).sort((a, b) => b - a);
  return sorted.reduce((sum, w, i) => sum + w / Math.pow(i + 1, config.crowd.diminishingExponent), 0);
}

export function computePriority(input: PriorityInput): PriorityResult {
  const baseTier = config.priority.categoryBase[input.category] ?? "low";
  const distinct = input.members.length;
  const score = crowdScore(input.members.map((m) => m.weight));
  const bonus = config.priority.crowdLevelThresholds.filter((t) => score >= t).length;
  const cappedAccounts = input.members.filter((m) => m.capped).length;

  const explanation: string[] = [];
  let lvl: number;
  let forced = false;
  let clamp = false;

  if (input.hazard.isHazard) {
    lvl = level(config.priority.safetyForcesTier);
    forced = true;
    explanation.push(`Safety hazard (${input.hazard.type && input.hazard.type !== "none" ? input.hazard.type : "reported"}): always critical, however it was worded.`);
  } else {
    lvl = level(baseTier);
    explanation.push(`Starts at ${baseTier} because of the problem type (${input.category.replace("_", " ")}).`);
    const before = lvl;
    lvl = Math.min(lvl + bonus, level(config.priority.crowdMaxTier));
    if (lvl > before) {
      explanation.push(`Raised ${lvl - before} step(s) because ${distinct} students are affected (credibility-weighted crowd score ${score.toFixed(1)}).`);
    } else if (distinct > 1) {
      explanation.push(`${distinct} students are affected (crowd score ${score.toFixed(1)}), not enough yet to raise it.`);
    }
    if (distinct <= 1 && lvl > level(config.crowd.singleUserMaxTierForLowSeverity) && level(baseTier) <= level(config.crowd.singleUserMaxTierForLowSeverity)) {
      lvl = level(config.crowd.singleUserMaxTierForLowSeverity);
      clamp = true;
      explanation.push("A single student cannot raise an issue above medium, however trusted.");
    }
    if (cappedAccounts > 0) {
      explanation.push(`${cappedAccounts} of the affected accounts are new or have little history, so they count for less.`);
    }
  }
  explanation.push("Capital letters, exclamation marks and the word \"urgent\" are not used.");

  const tier = TIERS[lvl];
  return {
    tier,
    score: lvl * 100 + score * 10 + level(baseTier),
    breakdown: {
      version: 1,
      tier,
      base: { category: input.category, tier: baseTier },
      safety: { isHazard: input.hazard.isHazard, type: input.hazard.type ?? null, forced },
      crowd: { distinctStudents: distinct, score: Math.round(score * 100) / 100, bonusTiers: bonus, perPersonCap: config.crowd.perPersonWeightCap, cappedAccounts, singleStudentClamp: clamp },
      ignored: ["tone", "capital letters", "exclamation marks", "the word 'urgent'", "who wrote the report"],
      explanation,
    },
  };
}
