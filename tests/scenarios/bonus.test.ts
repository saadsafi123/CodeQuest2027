// Bonus features: the trending board and the AI-written admin summary.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);

import { addAdmin, addStaff, addStudent, resetFakes } from "../fakes";
import { callerBlocked, callerReturning, poolWithKeys } from "../helpers";
import { generateAdminSummary, summaryFallback, type SummaryFacts } from "@/lib/ai/summary";
import { rankTrending, trendScore } from "@/lib/rules/trending";
import { ingestReport } from "@/lib/services/reportService";
import { adminSummary, clearSummaryCache } from "@/lib/services/summaryService";
import { listTrending } from "@/lib/services/trendingService";

const NOW = new Date("2026-11-24T12:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const issue = (o: Partial<{ priority: string; status: string; meToo: number; createdAt: string; updatedAt: string; confidential: boolean }> = {}) => ({
  priority: "medium", status: "open", meToo: 1, createdAt: ago(5), updatedAt: ago(5), confidential: false, ...o,
});

describe("trending rule (pure)", () => {
  it("many different students beat one student at the same priority", () => {
    expect(trendScore(issue({ meToo: 6 }), NOW)).toBeGreaterThan(trendScore(issue({ meToo: 1 }), NOW));
  });
  it("a critical issue beats a low one, and fresh activity beats stale", () => {
    expect(trendScore(issue({ priority: "critical" }), NOW)).toBeGreaterThan(trendScore(issue({ priority: "low" }), NOW));
    expect(trendScore(issue({ updatedAt: ago(1) }), NOW)).toBeGreaterThan(trendScore(issue({ updatedAt: ago(200) }), NOW));
  });
  it("one student on a low-priority issue never outranks a crowd on a medium one", () => {
    const ranked = rankTrending([{ id: "lone", ...issue({ priority: "low", meToo: 1 }) }, { id: "crowd", ...issue({ priority: "medium", meToo: 5 }) }], NOW);
    expect(ranked.map((r) => r.issue.id)).toEqual(["crowd", "lone"]);
  });
  it("confidential and closed issues never trend; 'rising' = new and shared", () => {
    const ranked = rankTrending([
      { id: "c", ...issue({ confidential: true, priority: "critical", meToo: 9 }) },
      { id: "x", ...issue({ status: "closed", meToo: 9 }) },
      { id: "r", ...issue({ meToo: 3, createdAt: ago(2) }) },
      { id: "old", ...issue({ meToo: 3, createdAt: ago(100) }) },
    ], NOW);
    expect(ranked.map((r) => r.issue.id).sort()).toEqual(["old", "r"]);
    expect(ranked.find((r) => r.issue.id === "r")!.rising).toBe(true);
    expect(ranked.find((r) => r.issue.id === "old")!.rising).toBe(false);
  });
});

describe("trending board and admin summary through the services", () => {
  beforeEach(() => {
    resetFakes();
    clearSummaryCache();
  });

  it("lists non-confidential issues for any signed-in role, never a confidential one, with no identities", async () => {
    const a = addStudent("A"), b = addStudent("B"), c = addStudent("C");
    await ingestReport(a as never, "wifi nahi chal raha networking lab mein");
    await ingestReport(b as never, "Networking lab wifi is not working");
    await ingestReport(c as never, "Seniors are ragging first year students behind the cafeteria");
    for (const who of [a, addStaff("EE"), addAdmin()]) {
      const t = await listTrending(who as never);
      expect(t).toHaveLength(1);
      expect(t[0].issue).toMatchObject({ meToo: 2, confidential: false });
      expect(JSON.stringify(t)).not.toMatch(/userId|email|"reporterLabel"/); // no student identity anywhere
    }
    await expect(listTrending(null)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("the summary is admin only", async () => {
    await expect(adminSummary(addStudent("S") as never)).rejects.toMatchObject({ code: "forbidden" });
    await expect(adminSummary(addStaff("CSE") as never)).rejects.toMatchObject({ code: "forbidden" });
    await expect(adminSummary(null)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("with no AI keys the summary falls back to the rule-based briefing, labelled as such", async () => {
    await ingestReport(addStudent("A") as never, "wifi nahi chal raha networking lab mein");
    const s = await adminSummary(addAdmin() as never);
    expect(s.mode).toBe("fallback");
    expect(s.headline).toMatch(/1 active issue/);
  });
});

describe("AI summary module", () => {
  const facts: SummaryFacts = {
    total: 3, byStatus: { open: 2, reopened: 1 }, byPriority: { critical: 1, medium: 2 }, byDepartment: { CSE: 2, EE: 1 },
    needsDepartment: 0, awaitingPlace: 1, confidentialCount: 2,
    top: [{ title: "Socket sparking", place: "EE Lab 1", department: "EE", priority: "critical", status: "open", students: 1 }],
    reopened: [{ title: "Ac not cooling", place: "IS Lab 1" }],
  };

  it("uses the AI's text when it answers correctly", async () => {
    const out = await generateAdminSummary(facts, { pool: poolWithKeys(1), caller: callerReturning({ headline: "H", highlights: ["a"], watch: ["w"] }) });
    expect(out).toMatchObject({ headline: "H", highlights: ["a"], watch: ["w"], mode: "gemini" });
  });
  it("falls back when the AI is blocked or answers with the wrong shape", async () => {
    expect((await generateAdminSummary(facts, { pool: poolWithKeys(1), caller: callerBlocked })).mode).toBe("fallback");
    expect((await generateAdminSummary(facts, { pool: poolWithKeys(1), caller: callerReturning({ nope: true }) })).mode).toBe("fallback");
  });
  it("sends facts only inside data tags, with no names, and a confidential report only as a count", async () => {
    let seen = "";
    await generateAdminSummary(facts, { pool: poolWithKeys(1), caller: async (_k, _m, req) => ((seen = req.user), JSON.stringify({ headline: "H", highlights: [], watch: [] })) });
    expect(seen).toMatch(/<facts>[\s\S]*<\/facts>/);
    expect(seen).toContain('"confidentialCount":2');
  });
  it("the fallback briefing mentions the reopened fix and the confidential count", () => {
    const f = summaryFallback(facts);
    expect(f.watch.join(" ")).toMatch(/reopened/);
    expect(f.watch.join(" ")).toMatch(/2 confidential reports/);
  });
});
