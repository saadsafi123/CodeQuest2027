// Purpose: trust -> vote/report WEIGHT (decision D17). Pure. Ledger writes arrive in Phase 6; this is the weight rule.
// weight = 0.5 + trust/100. Accounts younger than 24h OR with fewer than 3 ledger events are capped at 0.5 (anti-brigading).
import { config } from "@/lib/config";

export interface TrustProfile {
  trustScore: number;
  createdAt: string | Date;
  ledgerEvents: number;
}

export interface TrustWeight {
  weight: number;
  capped: boolean;
  /** Plain-language reason, safe to show (no identity). */
  reason: string;
}

export function clampTrust(n: number): number {
  return Math.max(config.trust.min, Math.min(config.trust.max, n));
}

export function trustWeight(p: TrustProfile, now: Date = new Date()): TrustWeight {
  const t = config.trust;
  const raw = t.weightOffset + clampTrust(p.trustScore) / t.weightTrustDivisor;
  const ageHours = (now.getTime() - new Date(p.createdAt).getTime()) / 3_600_000;
  if (ageHours < t.newAccountMaxAgeHours) {
    return { weight: Math.min(raw, t.newAccountWeightCap), capped: true, reason: "new account (under 24 hours old)" };
  }
  if (p.ledgerEvents < t.newAccountMinLedgerEvents) {
    return { weight: Math.min(raw, t.newAccountWeightCap), capped: true, reason: "account has little history yet" };
  }
  return { weight: raw, capped: false, reason: "established account" };
}

/** Plain-language ledger reasons (stored in trust_events.reason, shown to the student and the admin). Never mention other people. */
export const trustReasons = {
  reportValidated: "Staff took up your report, so it was validated.",
  voteMatchedConfirm: "You confirmed the fix and the issue was closed: your vote matched the outcome.",
  voteMatchedDispute: "You disputed the fix and the issue was reopened: your vote matched the outcome.",
  flagged: (kind: "spam" | "fake" | "abuse") =>
    kind === "abuse"
      ? "A report of yours was flagged as abuse of the system by staff or the admin."
      : `A report of yours was flagged as ${kind} by staff or the admin.`,
};

export function flagDelta(kind: "spam" | "fake" | "abuse"): number {
  return kind === "abuse" ? config.trust.deltas.abuse : config.trust.deltas.reportFlaggedSpamOrFake;
}

/** Why a student's weight is what it is, as short sentences (for the explainer page). */
export function explainWeight(p: TrustProfile, now: Date = new Date()): { weight: number; lines: string[] } {
  const t = config.trust;
  const w = trustWeight(p, now);
  const raw = t.weightOffset + clampTrust(p.trustScore) / t.weightTrustDivisor;
  const lines = [`Base weight = ${t.weightOffset} + trust ${Math.round(clampTrust(p.trustScore))} / ${t.weightTrustDivisor} = ${raw.toFixed(2)}.`];
  if (w.capped) lines.push(`Capped at ${t.newAccountWeightCap}: ${w.reason}. Accounts under ${t.newAccountMaxAgeHours} hours old, or with fewer than ${t.newAccountMinLedgerEvents} trust events, count less so a burst of fresh accounts cannot push an issue around.`);
  else lines.push("No cap applies: the account is established.");
  lines.push(`Used weight: ${w.weight.toFixed(2)}. A weight counts for at most ${config.crowd.perPersonWeightCap} per person in crowd priority.`);
  return { weight: w.weight, lines };
}
