import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyAnswer, startClarification } from "@/lib/rules/clarification";
import { decideLocation, getLocationById } from "@/lib/rules/location";
import { config } from "@/lib/config";

const D = (m: string | null, t = "x") => decideLocation(m, t, { confidential: false });
const start = () => startClarification(D("room 999 of the quantum block"));

describe("clarification state machine (rules)", () => {
  it("starts with 0 answers used and the configured limit", () => {
    const s = start();
    expect(s).toMatchObject({ attempts: 0, maxAnswers: config.clarification.maxAnswers, adminOnly: false, reason: "unknown_place" });
    expect(s.question).toContain("couldn't find");
  });

  it("refuses to start when nothing needs clarification", () => {
    expect(() => startClarification(D("networking lab"))).toThrow();
  });

  it("a good answer resolves, and records history", () => {
    const o = applyAnswer(start(), "networking lab", { decision: D("networking lab") });
    expect(o.kind).toBe("resolved");
    if (o.kind === "resolved") {
      expect(o.location.id).toBe("cse-networking-lab");
      expect(o.state.attempts).toBe(1);
      expect(o.state.history[0].outcome).toBe("resolved");
    }
  });

  it("first wrong answer retries, second wrong answer escalates to admin-only", () => {
    const s0 = start();
    const o1 = applyAnswer(s0, "lab 7", { decision: D("lab 7") });
    expect(o1.kind).toBe("retry");
    if (o1.kind !== "retry") return;
    expect(o1.remaining).toBe(1);
    expect(o1.state.adminOnly).toBe(false);
    const o2 = applyAnswer(o1.state, "lab 9", { decision: D("lab 9") });
    expect(o2.kind).toBe("escalated");
    if (o2.kind === "escalated") expect(o2.state).toMatchObject({ attempts: 2, adminOnly: true });
  });

  it("a right answer on the last attempt still resolves", () => {
    const o1 = applyAnswer(start(), "lab 7", { decision: D("lab 7") });
    if (o1.kind !== "retry") throw new Error("expected retry");
    expect(applyAnswer(o1.state, "db lab", { decision: D("db lab") }).kind).toBe("resolved");
  });

  it("after escalation or resolution-limit further answers are closed", () => {
    const s = { ...start(), attempts: 2, adminOnly: true };
    expect(applyAnswer(s, "db lab", { decision: D("db lab") }).kind).toBe("closed");
  });

  it("a picked suggestion resolves without text matching", () => {
    const picked = getLocationById("ee-lab-2")!;
    expect(applyAnswer(start(), "EE Lab 2", { picked }).kind).toBe("resolved");
  });

  it("refreshes the question from the latest unresolved answer", () => {
    const o = applyAnswer(start(), "lab 1", { decision: D("lab 1") });
    expect(o.kind).toBe("retry");
    expect(o.state.question).toMatch(/EE Lab 1/);
    expect(o.state.reason).toBe("ambiguous_place");
  });
});

// ------------------------------------------------------------------ service

vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);
import { db, resetFakes } from "../fakes";

const seenByAi = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/ai/analyze", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/analyze")>();
  const { KeyPool } = await import("@/lib/ai/keyPool");
  // no Gemini keys in tests: deterministic fallback path; also records exactly what the AI layer is given
  return { ...m, analyzeReport: (t: string) => (seenByAi.push(t), m.analyzeReport(t, { pool: new KeyPool([]) })) };
});

import { answerClarification, clearAnalysisCache, ingestReport } from "@/lib/services/reportService";

const student = { id: "u1", name: "S1", role: "student", department: null, trustScore: 50, createdAt: "" } as const;
const other = { ...student, id: "u2" };
const staff = { ...student, id: "u3", role: "staff", department: "EE" } as const;

describe("reportService (clarification flow, in-memory repository)", () => {
  beforeEach(() => {
    resetFakes();
    clearAnalysisCache();
    seenByAi.length = 0;
  });

  it("unknown room -> needs_clarification, not routed, nothing guessed", async () => {
    const v = await ingestReport(student as any, "AC is not working in Room 999 of the Quantum Block");
    expect(v.status).toBe("needs_clarification");
    expect(v.location).toBeNull();
    expect(v.clarification?.answersRemaining).toBe(2);
    expect(v.message).toContain("couldn't find");
  });

  it("known place -> received with canonical location and owning department", async () => {
    const v = await ingestReport(student as any, "projector kharab hai networking lab mein");
    expect(v).toMatchObject({ status: "routed", location: { id: "cse-networking-lab", department: "CSE" }, clarification: null });
  });

  it("answer flow: wrong, then right -> resolved", async () => {
    const v = await ingestReport(student as any, "wifi is down in lab 3");
    expect(v.status).toBe("needs_clarification");
    const r1 = await answerClarification(student as any, { reportId: v.id, answer: "lab 4" });
    expect(r1.status).toBe("needs_clarification");
    expect(r1.clarification?.answersRemaining).toBe(1);
    const r2 = await answerClarification(student as any, { reportId: v.id, answer: "it is in the IS Lab 2" });
    expect(r2).toMatchObject({ status: "routed", location: { id: "is-lab-2", department: "IS" } });
  });

  it("two wrong answers -> admin-only and no more answers accepted", async () => {
    const v = await ingestReport(student as any, "wifi is down in lab 3");
    await answerClarification(student as any, { reportId: v.id, answer: "lab 4" });
    const r2 = await answerClarification(student as any, { reportId: v.id, answer: "lab 5" });
    expect(r2.clarification?.adminOnly).toBe(true);
    expect(r2.status).toBe("needs_clarification");
    expect(r2.location).toBeNull();
    await expect(answerClarification(student as any, { reportId: v.id, answer: "db lab" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("picking an offered suggestion works; a place that was not offered is rejected", async () => {
    const v = await ingestReport(student as any, "wifi is down in lab 3");
    expect(v.clarification?.suggestions.length).toBeGreaterThan(0);
    await expect(answerClarification(student as any, { reportId: v.id, locationId: "parking" })).rejects.toMatchObject({ code: "bad_request" });
    const pick = v.clarification!.suggestions[0].id;
    const r = await answerClarification(student as any, { reportId: v.id, locationId: pick });
    expect(r.status).toBe("routed");
    expect(r.location?.id).toBe(pick);
  });

  it("a report that names NO place (or only a bare 'lab') is asked about BEFORE it is saved", async () => {
    const none = await ingestReport(student as any, "projector kharab hai");
    expect(none).toMatchObject({ status: "needs_place", id: "", placePrompt: { reason: "no_place" } });
    expect(none.placePrompt!.question).toBe("Where is this problem?");
    const lab = await ingestReport(student as any, "projector not working in the lab");
    expect(lab.status).toBe("needs_place");
    expect(lab.placePrompt!.options.length).toBe(7); // every lab, each department has its own
    expect(lab.placePrompt!.question).toMatch(/Each department has its own labs/);
    expect(new Set(lab.placePrompt!.options.map((o) => o.department))).toEqual(new Set(["CSE", "EE", "IS"]));
    expect(db.reports.size).toBe(0); // nothing saved, nothing routed
    expect(db.issues.size).toBe(0);
  });

  it("only the author can answer; others see 'not found'", async () => {
    const v = await ingestReport(student as any, "wifi is down in lab 3");
    await expect(answerClarification(other as any, { reportId: v.id, answer: "db lab" })).rejects.toMatchObject({ code: "not_found" });
    await expect(answerClarification(staff as any, { reportId: v.id, answer: "db lab" })).rejects.toMatchObject({ code: "not_found" });
    await expect(answerClarification(null, { reportId: v.id, answer: "db lab" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("only students can submit; empty text is rejected", async () => {
    await expect(ingestReport(staff as any, "wifi down")).rejects.toMatchObject({ code: "forbidden" });
    await expect(ingestReport(null, "wifi down")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(ingestReport(student as any, "   ")).rejects.toMatchObject({ code: "bad_request" });
  });

  it("answering a report that is not waiting for clarification is a conflict", async () => {
    const v = await ingestReport(student as any, "projector kharab hai networking lab mein");
    await expect(answerClarification(student as any, { reportId: v.id, answer: "db lab" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("a second simultaneous answer loses the compare-and-set", async () => {
    const v = await ingestReport(student as any, "wifi is down in lab 3");
    const results = await Promise.allSettled([
      answerClarification(student as any, { reportId: v.id, answer: "lab 4" }),
      answerClarification(student as any, { reportId: v.id, answer: "lab 5" }),
    ]);
    // both read attempts=0; the in-memory store applies only the first update
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("confidential report: never asks for a place and reveals nothing but an acknowledgement", async () => {
    const v = await ingestReport(student as any, "Seniors are ragging first years in room 999 of the Quantum Block");
    expect(v).toMatchObject({ confidential: true, status: "routed", location: null, clarification: null });
    expect(v.message).toMatch(/confidentially/);
    expect(JSON.stringify(v)).not.toMatch(/ragging|Quantum/);
  });

  it("the AI never receives user identity", async () => {
    await ingestReport({ ...student, name: "Very Secret Name" } as any, "wifi down in db lab");
    expect(seenByAi).toEqual(["wifi down in db lab"]);
    expect(seenByAi.join(" ")).not.toMatch(/Very Secret Name|u1/);
  });
});
