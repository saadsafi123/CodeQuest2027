// Phases 5 and 6 end to end through the REAL services and rules (in-memory repositories mirroring the SQL functions).
// Community flow: join -> resolve -> confirm / dispute -> reopen -> re-resolve; trust ledger, flags, explainer.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);

import { addAdmin, addStaff, addStudent, db, resetFakes } from "../fakes";
import { changeStatus, flagReport, getIssueDetail, listMyIssues, listQueue } from "@/lib/services/issueService";
import { ingestReport } from "@/lib/services/reportService";
import { getTrustBreakdown, listStudentTrust } from "@/lib/services/trustService";
import { castVote } from "@/lib/services/voteService";

type U = ReturnType<typeof addStudent>;
const submit = (u: U, text: string) => ingestReport(u as never, text);
const vote = (u: U, issueId: string, v: "confirm" | "dispute") => castVote(u as never, issueId, v);

const VARIANTS = [
  "projector kharab hai networking lab mein",
  "networking lab ka projecter nahi chal raha",
  "projector not working in the networking lab",
  "networking lab mein projector band hai",
  "the projector in networking lab is broken",
  "networking lab projector dead hai yaar",
  "networking lab ka projector kaam nahi kar raha",
  "projector networking lab me kharab hai",
];

let staff: ReturnType<typeof addStaff>, otherStaff: ReturnType<typeof addStaff>, admin: ReturnType<typeof addAdmin>;
beforeEach(() => {
  resetFakes();
  staff = addStaff("CSE");
  otherStaff = addStaff("EE");
  admin = addAdmin();
});

/** n established students all report the same problem: one issue with n affected students. */
async function issueWith(members: U[]): Promise<string> {
  let id = "";
  for (let i = 0; i < members.length; i++) {
    const v = await submit(members[i], VARIANTS[i % VARIANTS.length]);
    if (i === 0) id = v.issue!.id;
    expect(v.issue!.id, `member ${i} should join the same issue`).toBe(id);
  }
  expect(db.issues.size).toBe(1);
  return id;
}
const students = (n: number, kind: "normal" | "veteran" | "newbie" = "normal") => Array.from({ length: n }, (_, i) => addStudent(`S${i + 1}`, kind));
const resolve = async (id: string, note = "Replaced the lamp") => {
  await changeStatus(staff as never, id, "in_progress", null);
  return changeStatus(staff as never, id, "resolved", note);
};
const events = (u: U) => db.trustEvents.filter((e) => e.userId === u.id);

describe("Phase 5: who may vote", () => {
  it("only affected students vote; staff, admin, outsiders and anonymous are rejected on the server", async () => {
    const [a, b] = students(2);
    const outsider = addStudent("Outsider");
    const id = await issueWith([a, b]);
    await resolve(id);
    await expect(vote(outsider, id, "dispute")).rejects.toMatchObject({ code: "forbidden" });
    await expect(castVote(staff as never, id, "confirm")).rejects.toMatchObject({ code: "forbidden" });
    await expect(castVote(admin as never, id, "confirm")).rejects.toMatchObject({ code: "forbidden" });
    await expect(castVote(null, id, "confirm")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(vote(a, "00000000-0000-4000-8000-0000000fffff", "confirm")).rejects.toMatchObject({ code: "not_found" });
    expect(db.votes).toHaveLength(0);
  });

  it("voting is open only while the issue is resolved", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    await expect(vote(a, id, "dispute")).rejects.toMatchObject({ code: "conflict" }); // open
    await resolve(id);
    await expect(vote(a, id, "confirm")).resolves.toMatchObject({ outcome: "pending" });
  });

  it("one vote per student per resolution round", async () => {
    const [a, b, c] = students(3);
    const id = await issueWith([a, b, c]);
    await resolve(id);
    await vote(a, id, "confirm");
    await expect(vote(a, id, "dispute")).rejects.toMatchObject({ code: "conflict", message: /already voted/ });
    expect(db.votes.filter((v) => v.userId === a.id)).toHaveLength(1);
  });

  it("the vote weight comes from the server's trust ledger, not from the client", async () => {
    const vet = addStudent("Vet", "veteran");
    const nb = addStudent("NB", "newbie");
    const id = await issueWith([vet, nb]);
    await resolve(id);
    await vote(vet, id, "confirm");
    await vote(nb, id, "dispute");
    expect(db.votes.find((v) => v.userId === vet.id)!.weight).toBeCloseTo(1.41); // trust 88 + 3 for the validated report
    expect(db.votes.find((v) => v.userId === nb.id)!.weight).toBe(0.5); // new account: capped
  });
});

describe("Phase 5: dispute threshold, reopen, new round", () => {
  it("enough credible disputes reopen the issue; every affected student sees it on their dashboard", async () => {
    const [a, b, c] = students(3);
    const id = await issueWith([a, b, c]);
    await resolve(id);
    expect((await listMyIssues(c as never))[0]).toMatchObject({ status: "resolved", needsMyVote: true });
    await vote(a, id, "dispute");
    const r = await vote(b, id, "dispute");
    expect(r).toMatchObject({ outcome: "reopened", status: "reopened", disputeN: 2, confirmN: 0, members: 3 });
    for (const u of [a, b, c]) {
      const mine = (await listMyIssues(u as never))[0];
      expect(mine.status).toBe("reopened");
      expect(mine.needsMyVote).toBe(false);
    }
    const d = await getIssueDetail(a as never, id);
    expect(d.timeline.at(-1)).toMatchObject({ to: "reopened" });
    expect(d.timeline.at(-1)!.note).toMatch(/2 of 3 affected students disputed/);
    expect(d.voting).toMatchObject({ open: false, disputeN: 2, round: 1 });
    // the disputers' votes matched the outcome: +1 each, with a plain reason; the confirmer-to-be gets nothing
    expect(events(a)).toHaveLength(2); // report validated (+3) and vote matched (+1)
    expect(events(a).map((e) => e.delta).sort()).toEqual([1, 3]);
    expect(events(a).find((e) => e.kind === "vote_matched")!.reason).toMatch(/disputed the fix and the issue was reopened/);
    expect(events(c).some((e) => e.kind === "vote_matched")).toBe(false);
  });

  it("a lone dispute among several affected students does not reopen it", async () => {
    const [a, b, c] = students(3);
    const id = await issueWith([a, b, c]);
    await resolve(id);
    expect(await vote(a, id, "dispute")).toMatchObject({ outcome: "pending", status: "resolved" });
    await vote(b, id, "confirm");
    expect(await vote(c, id, "confirm")).toMatchObject({ outcome: "closed", status: "closed" });
    expect(events(a).some((e) => e.kind === "vote_matched")).toBe(false); // the lone disputer did not match the outcome
    expect(events(b).find((e) => e.kind === "vote_matched")!.delta).toBe(1);
  });

  it("a single affected student can reopen on their own (D16)", async () => {
    const [a] = students(1);
    const id = await issueWith([a]);
    await resolve(id);
    expect(await vote(a, id, "dispute")).toMatchObject({ outcome: "reopened", status: "reopened" });
  });

  it("the confirm path closes the issue when everyone affected confirmed", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    await resolve(id);
    expect(await vote(a, id, "confirm")).toMatchObject({ outcome: "pending" });
    expect(await vote(b, id, "confirm")).toMatchObject({ outcome: "closed", status: "closed" });
    await expect(vote(a, id, "dispute")).rejects.toMatchObject({ code: "conflict" }); // voting is over
  });

  it("re-resolving a reopened issue starts a fresh round: old votes do not carry over, everyone can vote again", async () => {
    const [a, b, c] = students(3);
    const id = await issueWith([a, b, c]);
    await resolve(id);
    await vote(a, id, "dispute");
    await vote(b, id, "dispute"); // reopened
    expect(db.issues.get(id)!.resolutionRound).toBe(1);

    await changeStatus(staff as never, id, "in_progress", "Looking again");
    await changeStatus(staff as never, id, "resolved", "Replaced the unit this time");
    expect(db.issues.get(id)!.resolutionRound).toBe(2);
    const detail = await getIssueDetail(a as never, id);
    expect(detail.voting).toMatchObject({ round: 2, open: true, confirmN: 0, disputeN: 0, canVote: true, myVote: null });

    // the same students vote again in round 2: allowed (unique per round). Two weighty confirmations are already a
    // weighted majority of the pool, so the issue closes early.
    await vote(a, id, "confirm");
    expect(await vote(b, id, "confirm")).toMatchObject({ outcome: "closed", closeReason: "early_majority" });
    expect(db.votes.filter((v) => v.userId === a.id).map((v) => v.round).sort()).toEqual([1, 2]);
  });

  it("live tallies: counts, who is still waiting, my vote; no names", async () => {
    const [a, b, c, d] = students(4);
    const id = await issueWith([a, b, c, d]);
    await resolve(id);
    await vote(a, id, "confirm");
    await vote(b, id, "dispute");
    const view = await getIssueDetail(c as never, id);
    expect(view.voting).toMatchObject({ members: 4, confirmN: 1, disputeN: 1, waiting: 2, myVote: null, canVote: true, disputersNeeded: 2 });
    expect(JSON.stringify(view)).not.toMatch(new RegExp(`${a.id}|${b.id}|"S1"|"S2"`));
    const mine = await getIssueDetail(b as never, id);
    expect(mine.voting).toMatchObject({ myVote: "dispute", canVote: false });
  });
});

describe("Phase 5/7: new-account brigading on votes (R8)", () => {
  it("two brand-new accounts disputing together cannot reopen an issue that has credible affected students", async () => {
    const credible = students(3);
    const mob = students(2, "newbie");
    const id = await issueWith([...credible, ...mob]);
    await resolve(id);
    await vote(mob[0], id, "dispute");
    const r = await vote(mob[1], id, "dispute"); // 2 disputers, 100% of the weight cast, but only 0.5 + 0.5 = 1.0 < 1.2
    expect(r).toMatchObject({ outcome: "pending", disputeN: 2, status: "resolved" });
    expect(r.disputeW).toBeCloseTo(1.0);
    // the credible students can still decide: two of them confirm = a weighted majority of the pool -> early close
    await vote(credible[0], id, "confirm");
    expect(await vote(credible[1], id, "confirm")).toMatchObject({ outcome: "closed", closeReason: "early_majority" }); // 2.06 of 4.09 pool weight
  });

  it("five brand-new accounts cannot out-vote credible students who confirm: the issue closes early before they can swing it", async () => {
    const credible = students(3);
    const mob = students(5, "newbie");
    const id = await issueWith([...credible, ...mob]);
    await resolve(id);
    for (const u of credible) await vote(u, id, "confirm"); // 3 x 1.03 = 3.09 > half of the pool (5.59 / 2)
    expect(db.issues.get(id)!.status).toBe("closed");
    await expect(vote(mob[0], id, "dispute")).rejects.toMatchObject({ code: "conflict" });
  });

  it("the same number of established students weigh more and CAN reopen", async () => {
    const credible = students(3);
    const real = students(5);
    const id = await issueWith([...credible, ...real]);
    await resolve(id);
    await vote(credible[0], id, "confirm");
    await vote(real[0], id, "dispute");
    const r = await vote(real[1], id, "dispute"); // 2 disputers weigh 2.06 (>= 1.2) = 2.06 of 3.09 cast
    expect(r.outcome).toBe("reopened");
  });

  it("KNOWN WEAKNESS: three brand-new accounts weigh 1.5 together and CAN reopen if they vote before the credible students", async () => {
    const credible = students(3);
    const mob = students(3, "newbie");
    const id = await issueWith([...credible, ...mob]);
    await resolve(id);
    await vote(mob[0], id, "dispute");
    await vote(mob[1], id, "dispute");
    const r = await vote(mob[2], id, "dispute");
    expect(r.disputeW).toBeCloseTo(1.5);
    expect(r.outcome).toBe("reopened"); // raise config.voting.minDisputeWeightToReopen to 1.6 or more to stop this
  });
});

describe("Phase 5: the closing rules (window, early close, close now, late joiners)", () => {
  const HOUR = 3_600_000;
  it("sets a deadline when resolved (48 h by default) and shows it on the issue", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    const t0 = Date.now();
    const d = await resolve(id);
    const deadline = new Date(d.voting!.deadline!).getTime();
    expect(deadline - t0).toBeGreaterThan(47.9 * HOUR);
    expect(deadline - t0).toBeLessThan(48.1 * HOUR);
    expect(d.voting).toMatchObject({ open: true, windowHours: 48, confirmersNeeded: 2 });
    expect(d.voting!.closeRule).toMatch(/window ends/);
  });

  it("when the window ends with no reopen the issue closes by itself, evaluated lazily on read (no background job)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const [a, b, c] = students(3);
      const id = await issueWith([a, b, c]);
      await resolve(id);
      await vote(a, id, "confirm"); // one confirmation only: not a majority
      expect(db.issues.get(id)!.status).toBe("resolved");
      vi.setSystemTime(Date.now() + 49 * HOUR);
      expect(db.issues.get(id)!.status).toBe("resolved"); // nothing happens until someone reads it
      const dash = await listMyIssues(b as never);
      expect(dash[0].status).toBe("closed");
      expect(dash[0].needsMyVote).toBe(false);
      const d = await getIssueDetail(c as never, id);
      expect(d.timeline.at(-1)!.note).toMatch(/Closed automatically: the voting window ended/);
      expect(events(a).some((e) => e.kind === "vote_matched")).toBe(true); // the confirmer matched the outcome
      expect(events(b).some((e) => e.kind === "vote_matched")).toBe(false); // abstainers earn nothing
    } finally {
      vi.useRealTimers();
    }
  });

  it("reading the staff queue also settles an overdue issue; a late vote is refused and closes it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const [a, b] = students(2);
      const id = await issueWith([a, b]);
      await resolve(id);
      vi.setSystemTime(Date.now() + 49 * HOUR);
      await expect(vote(a, id, "dispute")).rejects.toMatchObject({ code: "conflict", message: /window.*ended/i });
      expect(db.issues.get(id)!.status).toBe("closed"); // the refused vote still settled it
      const [x, y] = students(2);
      const id2 = (await submit(x, "wifi nahi chal raha DB lab mein")).issue!.id;
      await submit(y, "wifi down in the db lab");
      await resolve(id2);
      vi.setSystemTime(Date.now() + 49 * HOUR);
      expect((await listQueue(staff as never)).find((i) => i.id === id2)!.status).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a disputed fix is not auto-closed: reopening wins over the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const [a, b, c] = students(3);
      const id = await issueWith([a, b, c]);
      await resolve(id);
      await vote(a, id, "dispute");
      await vote(b, id, "dispute"); // reopened immediately
      vi.setSystemTime(Date.now() + 49 * HOUR);
      expect((await getIssueDetail(c as never, id)).status).toBe("reopened");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the demo window is short and read from the environment", async () => {
    process.env.VOTING_WINDOW_MODE = "demo";
    try {
      const [a, b] = students(2);
      const id = await issueWith([a, b]);
      const t0 = Date.now();
      const d = await resolve(id);
      const left = new Date(d.voting!.deadline!).getTime() - t0;
      expect(left).toBeGreaterThan(110_000);
      expect(left).toBeLessThan(125_000);
    } finally {
      delete process.env.VOTING_WINDOW_MODE;
    }
  });

  it("early close needs a weighted majority of the whole pool and at least 2 distinct confirmers", async () => {
    const [a, b, c, d] = students(4);
    const id = await issueWith([a, b, c, d]);
    await resolve(id);
    expect(await vote(a, id, "confirm")).toMatchObject({ outcome: "pending" }); // one confirmer is never enough
    expect(await vote(b, id, "confirm")).toMatchObject({ outcome: "pending" }); // 2.06 of 4.12 = exactly half: not MORE than half
    expect(await vote(c, id, "confirm")).toMatchObject({ outcome: "closed", closeReason: "early_majority" });
  });

  it("a single affected student closes it with one confirmation", async () => {
    const [a] = students(1);
    const id = await issueWith([a]);
    await resolve(id);
    expect(await vote(a, id, "confirm")).toMatchObject({ outcome: "closed", closeReason: "early_majority" });
  });

  it("Close now: the owning department's staff or the admin, with a note; others cannot", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    await resolve(id);
    await expect(changeStatus(otherStaff as never, id, "closed", "x")).rejects.toMatchObject({ code: "not_found" });
    await expect(changeStatus(a as never, id, "closed", "x")).rejects.toMatchObject({ code: "not_found" });
    await expect(changeStatus(staff as never, id, "closed", "  ")).rejects.toMatchObject({ code: "bad_request", message: /note/ });
    expect((await getIssueDetail(staff as never, id)).allowedMoves).toContain("closed");
    const d = await changeStatus(staff as never, id, "closed", "Verified in person: the projector works");
    expect(d.status).toBe("closed");
    expect(d.timeline.at(-1)).toMatchObject({ label: "CSE staff", note: "Verified in person: the projector works" });
    // admin too
    const [x, y] = students(2);
    const id2 = (await submit(x, "wifi nahi chal raha DB lab mein")).issue!.id;
    await submit(y, "wifi down in the db lab");
    await resolve(id2);
    expect((await changeStatus(admin as never, id2, "closed", "Closed by the registrar")).status).toBe("closed");
  });

  it("late joiners can still join, but their vote is not counted in that round", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    await resolve(id);
    const late = addStudent("Late");
    const v = await submit(late, "networking lab mein projector band hai");
    expect(v.issue).toMatchObject({ id, joinedExisting: true, meToo: 3 });
    const mine = await getIssueDetail(late as never, id);
    expect(mine.voting).toMatchObject({ lateJoiner: true, canVote: false, members: 2 }); // the pool still has the 2 original students
    await expect(vote(late, id, "dispute")).rejects.toMatchObject({ code: "forbidden", message: /joined after the fix/ });
    expect((await listMyIssues(late as never))[0].needsMyVote).toBe(false);
    // the original students' tally ignores the late joiner entirely
    await vote(a, id, "dispute");
    expect((await getIssueDetail(b as never, id)).voting).toMatchObject({ members: 2, disputeN: 1, waiting: 1 });
    // next round (after a reopen and a new resolve) the late joiner is in the pool
    await vote(b, id, "dispute"); // 2 established disputers reopen
    await changeStatus(staff as never, id, "in_progress", null);
    await changeStatus(staff as never, id, "resolved", "Second attempt");
    expect((await getIssueDetail(late as never, id)).voting).toMatchObject({ lateJoiner: false, canVote: true, members: 3 });
  });
});

describe("Phase 6: trust ledger", () => {
  it("staff taking up an open issue validates every counted report once (+3), with a plain reason", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    await changeStatus(staff as never, id, "in_progress", null);
    for (const u of [a, b]) {
      expect(events(u)).toHaveLength(1);
      expect(events(u)[0]).toMatchObject({ delta: 3, kind: "report_validated" });
      expect(events(u)[0].reason).toMatch(/validated/);
    }
    await changeStatus(staff as never, id, "resolved", "done"); // second move: no second payment
    expect(events(a)).toHaveLength(1);
    expect(db.profiles.get(a.id)!.trustScore).toBe(53);
  });

  it("a student who joins AFTER validation is not paid; reports on confidential issues create no ledger rows at all", async () => {
    const [a] = students(1);
    const zain = addStudent("Zain");
    const id = await issueWith([a]);
    await changeStatus(staff as never, id, "in_progress", null);
    const late = addStudent("Late");
    await submit(late, "networking lab mein projector band hai");
    expect(events(late)).toHaveLength(0);

    const v = await submit(zain, "Seniors are ragging first year students behind the cafeteria");
    expect(v.confidential).toBe(true);
    const cid = [...db.issues.values()].find((i) => i.isConfidential)!.id;
    await changeStatus(admin as never, cid, "in_progress", null);
    await changeStatus(admin as never, cid, "resolved", "Handled");
    expect(events(zain)).toHaveLength(0); // nothing in the ledger can hint at a confidential report
  });

  it("staff of the owning department flag a report as fake: author -10, the report stops counting, priority is recomputed", async () => {
    const [a, b, c, d] = students(4);
    const id = await issueWith([a, b, c, d]);
    const before = db.issues.get(id)!;
    expect(before.meTooCount).toBe(4);
    const reportB = [...db.reports.values()].find((r) => r.userId === b.id)!;
    const out = await flagReport(staff as never, reportB.id, "fake", "Not at the lab at that time");
    expect(out).toMatchObject({ meTooCount: 3, closed: false });
    expect(db.profiles.get(b.id)!.trustScore).toBe(40);
    expect(events(b)[0]).toMatchObject({ delta: -10, kind: "report_flagged_fake" });
    expect(events(b)[0].reason).toMatch(/flagged as fake/);
    expect(db.issues.get(id)!.meTooCount).toBe(3);
    expect(db.members.find((m) => m.userId === b.id)!.excluded).toBe(true);
    // the flagged student no longer counts toward voting either
    await resolve(id);
    await expect(vote(b, id, "dispute")).rejects.toMatchObject({ code: "forbidden" });
    await expect(flagReport(staff as never, reportB.id, "spam", null)).rejects.toMatchObject({ code: "conflict" });
  });

  it("abuse costs -15 and the score never goes below 0; only the owning department's staff or the admin may flag", async () => {
    const lowest = addStudent("Low", "normal", 5);
    const [other] = students(1);
    const id = await issueWith([lowest, other]);
    const rep = [...db.reports.values()].find((r) => r.userId === lowest.id)!;
    await expect(flagReport(otherStaff as never, rep.id, "abuse", null)).rejects.toMatchObject({ code: "not_found" });
    await expect(flagReport(other as never, rep.id, "abuse", null)).rejects.toMatchObject({ code: "not_found" });
    await expect(flagReport(null, rep.id, "abuse", null)).rejects.toMatchObject({ code: "unauthorized" });
    await flagReport(admin as never, rep.id, "abuse", null);
    expect(db.profiles.get(lowest.id)!.trustScore).toBe(0);
    expect(events(lowest)[0].delta).toBe(-15);
    expect(id).toBeTruthy();
  });

  it("flagging the only report on an issue closes it", async () => {
    const [a] = students(1);
    const id = await issueWith([a]);
    const rep = [...db.reports.values()][0];
    expect(await flagReport(staff as never, rep.id, "spam", null)).toMatchObject({ meTooCount: 0, closed: true });
    expect(db.issues.get(id)!.status).toBe("closed");
  });

  it("the score rebuilds exactly from the ledger (explainer page data)", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    await changeStatus(staff as never, id, "in_progress", null);
    await changeStatus(staff as never, id, "resolved", "ok");
    await vote(a, id, "confirm");
    await vote(b, id, "confirm"); // closed -> +1 each
    // the fake registers profile scores directly, so give the explainer a consistent ledger-based account
    const t = await getTrustBreakdown(a as never, a.id);
    expect(t.events.map((e) => e.delta)).toEqual([3, 1]);
    expect(t.startScore).toBe(50);
    expect(t.events.at(-1)!.runningTotal).toBe(54);
    expect(t.rebuiltScore).toBe(54);
    expect(t.currentScore).toBe(54);
    expect(t.consistent).toBe(true);
    // only 2 ledger rows so far (< 3): the weight is still capped, and the page says why
    expect(t.weight.value).toBe(0.5);
    expect(t.weight.lines.join(" ")).toMatch(/Base weight = 0.5 \+ trust 54/);
    expect(t.weight.lines.join(" ")).toMatch(/little history/);
    expect(t.rules.join(" ")).toMatch(/\+3/);
  });

  it("who can read a trust ledger: the student themself and the admin; nobody else", async () => {
    const [a, b] = students(2);
    await expect(getTrustBreakdown(a as never, a.id)).resolves.toMatchObject({ userId: a.id });
    await expect(getTrustBreakdown(a as never, b.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getTrustBreakdown(staff as never, a.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getTrustBreakdown(admin as never, a.id)).resolves.toMatchObject({ name: "S1" });
    await expect(getTrustBreakdown(null, a.id)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(getTrustBreakdown(admin as never, "00000000-0000-4000-8000-0000000fffff")).rejects.toMatchObject({ code: "not_found" });
    await expect(listStudentTrust(a as never)).rejects.toMatchObject({ code: "forbidden" });
    expect((await listStudentTrust(admin as never)).map((r) => r.name).sort()).toEqual(["S1", "S2"]);
  });

  it("a new account's weight is explained as capped", async () => {
    const nb = addStudent("Fresh", "newbie");
    const t = await getTrustBreakdown(nb as never, nb.id);
    expect(t.weight.value).toBe(0.5);
    expect(t.weight.lines.join(" ")).toMatch(/Capped at 0.5/);
  });
});

describe("Phase 6: crowd priority recomputed when students join and when they are flagged", () => {
  it("joins raise importance; flagging a member lowers it again", async () => {
    const many = students(7);
    const first = await submit(many[0], "chair broken in cse room 101");
    const id = first.issue!.id;
    const low = db.issues.get(id)!.priorityScore;
    for (const u of many.slice(1)) await submit(u, "cse room 101 ki chair toot gayi hai");
    const risen = db.issues.get(id)!.priorityScore;
    expect(risen).toBeGreaterThan(low);
    for (const u of many.slice(1, 5)) {
      const rep = [...db.reports.values()].find((r) => r.userId === u.id)!;
      await flagReport(staff as never, rep.id, "spam", null).catch(() => {}); // CSE staff owns room 101
    }
    expect(db.issues.get(id)!.priorityScore).toBeLessThan(risen);
  });

  it("the routing note survives priority recomputation", async () => {
    const [a, b] = students(2);
    const id = await issueWith([a, b]);
    const d = await getIssueDetail(a as never, id);
    expect(d.routing).toMatch(/CSE|owns/);
    await resolve(id);
    await vote(a, id, "confirm");
    expect((await getIssueDetail(a as never, id)).routing).toBe(d.routing);
  });
});
