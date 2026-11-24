// Purpose: the resolution-vote rules, pure. The SQL function cast_resolution_vote mirrors this exactly; the in-memory test
// double calls THIS function, and `npm run live:community` confirms against the real database that the two agree.
//
// The POOL of a round = the affected students who had joined when staff marked the issue resolved, with their trust
// weights frozen at that moment. Late joiners are not in the pool (they cannot vote in that round).
//
//   reopen  = disputers >= 2 (1 if the pool has a single student)
//             AND dispute weight >= 50% of the weight cast
//             AND dispute weight >= 1.2 (or the pool's whole weight, if that is smaller)
//   early close = no reopen AND confirmers >= 2 (1 if single) AND confirm weight > 50% of the pool's total weight
//   closed (all voted) = no reopen and every student in the pool has voted
//   window end = no reopen -> closes automatically (done by settle_resolution in SQL, lazily on read)
import { config } from "@/lib/config";

export interface VoteTally {
  confirmN: number;
  disputeN: number;
  confirmW: number;
  disputeW: number;
}

export type VoteOutcome = "pending" | "reopened" | "closed";
export type CloseReason = "early_majority" | "all_voted";

export interface VoteEvaluation {
  outcome: VoteOutcome;
  closeReason?: CloseReason;
  /** Distinct disputers needed to reopen for this pool size. */
  disputersNeeded: number;
  /** Distinct confirmers needed for an early close. */
  confirmersNeeded: number;
  /** Combined dispute weight needed to reopen (after the "small pool" allowance). */
  minDisputeWeight: number;
  /** Dispute weight / weight cast (0 when nobody voted). */
  disputeShare: number;
  /** Confirm weight / total pool weight. */
  confirmShareOfPool: number;
  voted: number;
  waiting: number;
}

const EPS = 1e-9;

export function disputersNeeded(members: number): number {
  return members <= 1 ? config.voting.minDistinctDisputersSingleMember : config.voting.minDistinctDisputers;
}

export function confirmersNeeded(members: number): number {
  return members <= 1 ? config.voting.minDistinctConfirmersSingleMember : config.voting.minDistinctConfirmers;
}

/** Minimum combined dispute weight: the configured floor, or the pool's whole weight when the pool is lighter than that. */
export function minDisputeWeight(poolWeight: number): number {
  return Math.min(config.voting.minDisputeWeightToReopen, poolWeight);
}

export function evaluateVotes(members: number, t: VoteTally, poolWeight: number): VoteEvaluation {
  const v = config.voting;
  const voted = t.confirmN + t.disputeN;
  const cast = t.confirmW + t.disputeW;
  const base = {
    disputersNeeded: disputersNeeded(members),
    confirmersNeeded: confirmersNeeded(members),
    minDisputeWeight: minDisputeWeight(poolWeight),
    disputeShare: cast > 0 ? t.disputeW / cast : 0,
    confirmShareOfPool: poolWeight > 0 ? t.confirmW / poolWeight : 0,
    voted,
    waiting: Math.max(0, members - voted),
  };
  if (t.disputeN >= base.disputersNeeded && t.disputeW + EPS >= v.disputeWeightShareToReopen * cast && t.disputeW + EPS >= base.minDisputeWeight) {
    return { ...base, outcome: "reopened" };
  }
  if (t.confirmN >= base.confirmersNeeded && t.confirmW > v.earlyCloseConfirmShare * poolWeight + EPS) {
    return { ...base, outcome: "closed", closeReason: "early_majority" };
  }
  if (voted >= members) return { ...base, outcome: "closed", closeReason: "all_voted" };
  return { ...base, outcome: "pending" };
}

/** The numbers the SQL function needs. Everything tunable comes from config.ts. */
export function voteRpcConfig() {
  const v = config.voting;
  return {
    share: v.disputeWeightShareToReopen,
    min_disputers: v.minDistinctDisputers,
    min_disputers_single: v.minDistinctDisputersSingleMember,
    min_dispute_weight: v.minDisputeWeightToReopen,
    early_share: v.earlyCloseConfirmShare,
    min_confirmers: v.minDistinctConfirmers,
    min_confirmers_single: v.minDistinctConfirmersSingleMember,
    match_delta: config.trust.deltas.voteMatchesFinalOutcome,
    match_reason_confirm: "You confirmed the fix and the issue was closed: your vote matched the outcome.",
    match_reason_dispute: "You disputed the fix and the issue was reopened: your vote matched the outcome.",
  };
}

/** One sentence that explains the reopen rule to a student. */
export function reopenRuleText(members: number): string {
  const n = disputersNeeded(members);
  const pct = Math.round(config.voting.disputeWeightShareToReopen * 100);
  return members <= 1
    ? "This issue has one affected student, so one dispute reopens it."
    : `It reopens when at least ${n} affected students dispute it, their votes make up ${pct}% or more of the (trust-weighted) votes cast, and together they weigh at least ${config.voting.minDisputeWeightToReopen} (so two brand-new accounts alone cannot reopen it).`;
}

/** One sentence that explains how it closes. */
export function closeRuleText(members: number): string {
  const n = confirmersNeeded(members);
  const pct = Math.round(config.voting.earlyCloseConfirmShare * 100);
  return members <= 1
    ? "It closes when the affected student confirms, or when the voting window ends with no dispute."
    : `It closes early once at least ${n} students confirm and their weight is more than ${pct}% of everyone affected, or automatically when the voting window ends with no reopen.`;
}
