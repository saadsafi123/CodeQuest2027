import { describe, expect, it } from "vitest";
import { config, votingWindowSeconds } from "@/lib/config";
import { canFlagReports, canViewTrust, voteEligibility } from "@/lib/rules/permissions";
import { explainWeight, flagDelta, trustReasons } from "@/lib/rules/trust";
import { closeRuleText, confirmersNeeded, disputersNeeded, evaluateVotes, minDisputeWeight, reopenRuleText, voteRpcConfig } from "@/lib/rules/voting";

const student = (id = "s1") => ({ id, name: "S", role: "student" as const, department: null, trustScore: 50, createdAt: "" });
const staff = (dept: string) => ({ id: "t1", name: "T", role: "staff" as const, department: dept as never, trustScore: 50, createdAt: "" });
const admin = { id: "a1", name: "A", role: "admin" as const, department: null, trustScore: 50, createdAt: "" };

describe("evaluateVotes: reopen, early close, close (D16 + fixes pass 2)", () => {
  // members, tally, pool weight
  const T = (confirmN: number, disputeN: number, confirmW: number, disputeW: number) => ({ confirmN, disputeN, confirmW, disputeW });

  it("reopen needs 2 distinct disputers (1 if the pool has a single student)", () => {
    expect(disputersNeeded(1)).toBe(1);
    expect(disputersNeeded(2)).toBe(2);
    expect(disputersNeeded(10)).toBe(2);
    expect(evaluateVotes(1, T(0, 1, 0, 1), 1).outcome).toBe("reopened");
    expect(evaluateVotes(3, T(0, 1, 0, 1.4), 3.4).outcome).toBe("pending"); // a lone dispute never reopens a multi-student pool
    expect(evaluateVotes(3, T(0, 2, 0, 2), 3).outcome).toBe("reopened");
  });

  it("boundary: under 50% of the weight cast does not reopen, exactly 50% does", () => {
    expect(evaluateVotes(6, T(2, 2, 2.6, 2.4), 6).outcome).toBe("pending"); // 48%
    const half = evaluateVotes(6, T(2, 2, 2.5, 2.5), 6);
    expect(half.outcome).toBe("reopened");
    expect(half.disputeShare).toBeCloseTo(0.5);
  });

  it("the disputers must also weigh at least 1.2 together: two brand-new accounts (0.5 + 0.5) cannot reopen alone", () => {
    expect(config.voting.minDisputeWeightToReopen).toBe(1.2);
    // an established student is in the pool too (pool weight 2.0), the two new accounts dispute first: 1.0 < 1.2
    const blocked = evaluateVotes(3, T(0, 2, 0, 1.0), 2.0);
    expect(blocked.outcome).toBe("pending");
    expect(blocked.minDisputeWeight).toBe(1.2);
    // two established students (0.9 each) reach it
    expect(evaluateVotes(3, T(0, 2, 0, 1.8), 3).outcome).toBe("reopened");
    // one new + one established: 0.5 + 1.0 = 1.5
    expect(evaluateVotes(3, T(0, 2, 0, 1.5), 2.5).outcome).toBe("reopened");
  });

  it("if the whole pool is lighter than the floor (only new accounts are affected), the pool weight is the minimum", () => {
    expect(minDisputeWeight(1.0)).toBe(1.0);
    expect(minDisputeWeight(5)).toBe(1.2);
    expect(evaluateVotes(2, T(0, 2, 0, 1.0), 1.0).outcome).toBe("reopened"); // both new students dispute their own issue
    expect(evaluateVotes(1, T(0, 1, 0, 0.5), 0.5).outcome).toBe("reopened"); // a lone new student can reopen their own single-student issue
  });

  it("early close: at least 2 confirmers (1 if single) AND confirm weight more than 50% of the whole pool", () => {
    expect(confirmersNeeded(1)).toBe(1);
    expect(confirmersNeeded(5)).toBe(2);
    const early = evaluateVotes(4, T(2, 0, 2.4, 0), 4);
    expect(early).toMatchObject({ outcome: "closed", closeReason: "early_majority" });
    expect(early.confirmShareOfPool).toBeCloseTo(0.6);
  });

  it("early close needs MORE than the share, so exactly half of the pool weight is not enough", () => {
    // members 5, pool weight 5: two confirmers weigh 2.5 = exactly 50% -> not more than 50%
    expect(evaluateVotes(5, T(2, 0, 2.5, 0), 5).outcome).toBe("pending");
    expect(evaluateVotes(5, T(3, 0, 3.0, 0), 5)).toMatchObject({ outcome: "closed", closeReason: "early_majority" });
    // one very heavy confirmer is not enough without a second distinct confirmer
    expect(evaluateVotes(5, T(1, 0, 4.0, 0), 5).outcome).toBe("pending");
  });

  it("a trust-weighted majority: two heavy confirmers beat three light students", () => {
    // pool: 2 established (1.4 each) + 3 new (0.5 each) = 4.3 ; the two established confirm: 2.8 > 2.15
    expect(evaluateVotes(5, T(2, 0, 2.8, 0), 4.3)).toMatchObject({ outcome: "closed", closeReason: "early_majority" });
    // the three new students confirm instead: 1.5 < 2.15
    expect(evaluateVotes(5, T(3, 0, 1.5, 0), 4.3).outcome).toBe("pending");
  });

  it("reopen is checked before early close", () => {
    expect(evaluateVotes(4, T(2, 2, 2, 2), 4).outcome).toBe("reopened");
  });

  it("closes (all voted) only when nobody is left to vote and the dispute rule did not fire", () => {
    expect(evaluateVotes(3, T(1, 0, 1, 0), 3).outcome).toBe("pending");
    expect(evaluateVotes(2, T(1, 1, 1, 1), 2)).toMatchObject({ outcome: "closed", closeReason: "all_voted" });
  });

  it("reports how many are still waiting", () => {
    expect(evaluateVotes(5, T(1, 1, 1, 1), 5).waiting).toBe(3);
  });

  it("thresholds come from config, and the SQL gets the same numbers", () => {
    const c = voteRpcConfig();
    expect(c.share).toBe(config.voting.disputeWeightShareToReopen);
    expect(c.min_disputers).toBe(config.voting.minDistinctDisputers);
    expect(c.min_disputers_single).toBe(config.voting.minDistinctDisputersSingleMember);
    expect(c.min_dispute_weight).toBe(config.voting.minDisputeWeightToReopen);
    expect(c.early_share).toBe(config.voting.earlyCloseConfirmShare);
    expect(c.min_confirmers).toBe(config.voting.minDistinctConfirmers);
    expect(c.match_delta).toBe(config.trust.deltas.voteMatchesFinalOutcome);
  });

  it("explains the rules in plain words", () => {
    expect(reopenRuleText(1)).toMatch(/one dispute/);
    expect(reopenRuleText(4)).toMatch(/at least 2 affected students.*1\.2/);
    expect(closeRuleText(4)).toMatch(/early.*window ends/);
  });
});

describe("voting window", () => {
  it("is 48 hours by default and 2 minutes in demo mode", () => {
    expect(votingWindowSeconds({})).toBe(48 * 3600);
    expect(votingWindowSeconds({ VOTING_WINDOW_MODE: "demo" })).toBe(120);
    expect(votingWindowSeconds({ VOTING_WINDOW_MODE: " DEMO " })).toBe(120);
    expect(votingWindowSeconds({ VOTING_WINDOW_MODE: "normal" })).toBe(48 * 3600);
  });
});

describe("voteEligibility", () => {
  const resolved = { status: "resolved" as const, isConfidential: false };
  it("only affected students, only while resolved", () => {
    expect(voteEligibility(student(), resolved, { excluded: false })).toEqual({ ok: true });
    expect(voteEligibility(student(), resolved, null)).toEqual({ ok: false, reason: "not_affected" });
    expect(voteEligibility(student(), resolved, { excluded: true })).toEqual({ ok: false, reason: "not_affected" });
    expect(voteEligibility(student(), { status: "open", isConfidential: false }, { excluded: false })).toEqual({ ok: false, reason: "voting_closed" });
    expect(voteEligibility(student(), { status: "reopened", isConfidential: false }, { excluded: false })).toEqual({ ok: false, reason: "voting_closed" });
  });
  it("staff, admin and anonymous never vote; confidential issues have no vote", () => {
    expect(voteEligibility(staff("CSE"), resolved, { excluded: false }).ok).toBe(false);
    expect(voteEligibility(admin, resolved, { excluded: false }).ok).toBe(false);
    expect(voteEligibility(null, resolved, { excluded: false }).ok).toBe(false);
    expect(voteEligibility(student(), { status: "resolved", isConfidential: true }, { excluded: false })).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("flag and trust permissions", () => {
  const cse = { department: "CSE", isConfidential: false, status: "open" as const };
  it("only the owning department's staff or the admin may flag; never a confidential issue", () => {
    expect(canFlagReports(staff("CSE"), cse)).toBe(true);
    expect(canFlagReports(staff("EE"), cse)).toBe(false);
    expect(canFlagReports(admin, cse)).toBe(true);
    expect(canFlagReports(student(), cse)).toBe(false);
    expect(canFlagReports(admin, { ...cse, isConfidential: true })).toBe(false);
    expect(canFlagReports(staff("CSE"), { ...cse, department: null })).toBe(false);
  });
  it("a student sees only their own trust ledger; the admin any; staff none", () => {
    expect(canViewTrust(student("s1"), "s1")).toBe(true);
    expect(canViewTrust(student("s1"), "s2")).toBe(false);
    expect(canViewTrust(admin, "s2")).toBe(true);
    expect(canViewTrust(staff("CSE"), "s2")).toBe(false);
    expect(canViewTrust(null, "s2")).toBe(false);
  });
});

describe("trust deltas and weight explanation", () => {
  it("flag deltas come from config: spam/fake -10, abuse -15", () => {
    expect(flagDelta("spam")).toBe(config.trust.deltas.reportFlaggedSpamOrFake);
    expect(flagDelta("fake")).toBe(-10);
    expect(flagDelta("abuse")).toBe(-15);
    expect(trustReasons.flagged("fake")).toMatch(/fake/);
    expect(trustReasons.flagged("abuse")).toMatch(/abuse/);
  });
  it("explains an established account and a capped new one", () => {
    const old = explainWeight({ trustScore: 80, createdAt: new Date(Date.now() - 30 * 86_400_000), ledgerEvents: 10 });
    expect(old.weight).toBeCloseTo(1.3);
    expect(old.lines.join(" ")).toMatch(/No cap applies/);
    const fresh = explainWeight({ trustScore: 80, createdAt: new Date(), ledgerEvents: 0 });
    expect(fresh.weight).toBe(0.5);
    expect(fresh.lines.join(" ")).toMatch(/Capped at 0.5.*new account/);
    const quiet = explainWeight({ trustScore: 80, createdAt: new Date(Date.now() - 30 * 86_400_000), ledgerEvents: 1 });
    expect(quiet.lines.join(" ")).toMatch(/little history/);
  });
});
