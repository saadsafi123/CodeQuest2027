// The trust score shown to a user (top bar, dashboard tile) must always equal the ledger.
// Cause of the "wrong looking" score: it was rendered once on the server (layout) and cached for 10 s, so it went stale
// after trust changed (for example when staff validated a report in another browser) until a full reload.
// Fixes under test: (1) every trust change invalidates the user cache, (2) the displayed value comes from the LEDGER via
// getMyTrust (never from a cache), so even a corrupted cache cannot be shown.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);

import { addAdmin, addStaff, addStudent, db, resetFakes } from "../fakes";
import { changeStatus, flagReport } from "@/lib/services/issueService";
import { clearAnalysisCache, ingestReport } from "@/lib/services/reportService";
import { getMyTrust, getTrustBreakdown } from "@/lib/services/trustService";
import { getUser, invalidateUser } from "@/lib/services/userService";
import { castVote } from "@/lib/services/voteService";

type U = ReturnType<typeof addStudent>;
const submit = (u: U, t: string) => ingestReport(u as never, t);
const ledger = (u: U) => Math.max(0, Math.min(100, 50 + (db.seedSum.get(u.id) ?? 0) + db.trustEvents.filter((e) => e.userId === u.id).reduce((s, e) => s + e.delta, 0)));

let staff: ReturnType<typeof addStaff>;
beforeEach(() => {
  resetFakes();
  clearAnalysisCache();
  invalidateUser();
  staff = addStaff("CSE");
});

describe("the user cache never serves a stale trust score", () => {
  it("staff validating a report: the cached user shows +3 immediately", async () => {
    const a = addStudent("A", "normal");
    const v = await submit(a, "projector kharab hai networking lab mein");
    expect((await getUser(a.id))!.trustScore).toBe(50); // now cached
    await changeStatus(staff as never, v.issue!.id, "in_progress", null);
    expect((await getUser(a.id))!.trustScore).toBe(53); // fails if the cache is not invalidated on a trust change
  });

  it("a vote that closes the issue, and a flag: same", async () => {
    const [a, b] = [addStudent("A"), addStudent("B")];
    const v = await submit(a, "projector kharab hai networking lab mein");
    await submit(b, "networking lab ka projecter nahi chal raha");
    await changeStatus(staff as never, v.issue!.id, "in_progress", null);
    await changeStatus(staff as never, v.issue!.id, "resolved", "Fixed");
    expect((await getUser(a.id))!.trustScore).toBe(53);
    await castVote(a as never, v.issue!.id, "confirm");
    await castVote(b as never, v.issue!.id, "confirm"); // closes -> +1 each
    expect((await getUser(a.id))!.trustScore).toBe(54);
    expect((await getUser(b.id))!.trustScore).toBe(54);

    const c = addStudent("C");
    await submit(c, "DB lab ka wifi nahi chal raha");
    const rep = [...db.reports.values()].find((r) => r.userId === c.id)!;
    expect((await getUser(c.id))!.trustScore).toBe(50);
    await flagReport(staff as never, rep.id, "fake", null);
    expect((await getUser(c.id))!.trustScore).toBe(40);
  });
});

describe("what the top bar shows is the ledger, not a cache", () => {
  it("getMyTrust equals 50 + the sum of the ledger after every kind of trust change", async () => {
    const [a, b] = [addStudent("A"), addStudent("B")]; // start at 50 with an empty ledger, like a real new account
    const v = await submit(a, "projector kharab hai networking lab mein");
    await submit(b, "networking lab ka projecter nahi chal raha");
    const check = async () => {
      for (const u of [a, b]) {
        const mine = await getMyTrust(u as never);
        expect(mine.score, u.name).toBe(ledger(u));
        const page = await getTrustBreakdown(u as never, u.id);
        expect(page.currentScore, `${u.name} explainer`).toBe(mine.score);
        expect(page.consistent).toBe(true);
      }
    };
    await check();
    await changeStatus(staff as never, v.issue!.id, "in_progress", null);
    await check();
    await changeStatus(staff as never, v.issue!.id, "resolved", "ok");
    await castVote(a as never, v.issue!.id, "confirm");
    await castVote(b as never, v.issue!.id, "confirm");
    await check();
    const rep = [...db.reports.values()].find((r) => r.userId === b.id)!;
    await flagReport(addAdmin() as never, rep.id, "abuse", null);
    await check();
  });

  it("a corrupted cached score cannot be shown: the endpoint answers from the ledger", async () => {
    const a = addStudent("A");
    await submit(a, "projector kharab hai networking lab mein");
    db.profiles.get(a.id)!.trustScore = 99; // simulate drift of the cached number
    expect((await getMyTrust(a as never)).score).toBe(50);
  });

  it("only the signed-in user's own score is returned; no user, no answer", async () => {
    const a = addStudent("A");
    await expect(getMyTrust(null)).rejects.toMatchObject({ code: "unauthorized" });
    expect((await getMyTrust(a as never)).userId).toBe(a.id);
  });
});

describe("the score never leaves 0..100 and always rebuilds", () => {
  it("many changes in a row stay clamped and equal to the ledger", async () => {
    const a = addStudent("A", "normal", 8);
    await submit(a, "projector kharab hai networking lab mein");
    const rep = [...db.reports.values()][0];
    await flagReport(staff as never, rep.id, "abuse", null); // 8 - 15 -> 0
    expect((await getMyTrust(a as never)).score).toBe(0);
    expect(ledger(a)).toBe(0);
    expect(db.profiles.get(a.id)!.trustScore).toBe(0);
  });
});
