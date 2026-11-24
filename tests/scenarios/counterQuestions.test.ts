// The counter-question flow: the AI decides whether the problem is clear; unclear -> ask; place missing -> ask;
// everything clear -> a summary the student confirms. Nothing is saved or routed before the confirmation.
// The AI is mocked (no network): the model answer is what decides "clear" or not.
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ aiClear: true as boolean | undefined, calls: 0 }));
vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);
vi.mock("@/lib/ai/analyze", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/ai/analyze")>();
  const { KeyPool } = await import("@/lib/ai/keyPool");
  return {
    ...m,
    analyzeReport: async (t: string) => {
      hoisted.calls++;
      const r = await m.analyzeReport(t, { pool: new KeyPool([]) });
      // pretend the AI said whether the problem is clear
      r.extraction = { ...r.extraction, problem_is_clear: hoisted.aiClear, follow_up_question: hoisted.aiClear === false ? "What exactly is wrong?" : null };
      return r;
    },
  };
});

import { addStudent, db, resetFakes } from "../fakes";
import { clearAnalysisCache, ingestReport } from "@/lib/services/reportService";

let s: ReturnType<typeof addStudent>;
const submit = (text: string, opts: Parameters<typeof ingestReport>[2] = {}) => ingestReport(s as never, text, opts);

beforeEach(() => {
  resetFakes();
  clearAnalysisCache();
  hoisted.aiClear = true;
  hoisted.calls = 0;
  s = addStudent("S");
});

describe("counter-question 1: what is the problem? (decided by the AI)", () => {
  it("an unclear report asks the AI's question and saves nothing", async () => {
    hoisted.aiClear = false;
    const v = await submit("problem hai", { dryRun: true });
    expect(v).toMatchObject({ status: "needs_problem", followUp: { question: "What exactly is wrong?" } });
    expect(db.reports.size).toBe(0);
    expect(db.issues.size).toBe(0);
  });

  it("the real submit refuses an unclear report too (the server does not rely on the client)", async () => {
    hoisted.aiClear = false;
    expect((await submit("problem hai")).status).toBe("needs_problem");
    expect(db.reports.size).toBe(0);
  });

  it("after the answer it moves on to the place question", async () => {
    hoisted.aiClear = true;
    const v = await submit("problem hai. projector kharab hai", { dryRun: true, followUpAnswers: 1 });
    expect(v.status).toBe("needs_place");
  });

  it("asks again while still unclear, but not forever: after the cap the report goes on", async () => {
    hoisted.aiClear = false;
    expect((await submit("problem hai", { dryRun: true, followUpAnswers: 2 })).status).toBe("needs_problem");
    expect((await submit("problem hai", { dryRun: true, followUpAnswers: 3 })).status).not.toBe("needs_problem");
  });

  it("a safety hazard is never held back, even if the AI calls it unclear", async () => {
    hoisted.aiClear = false;
    const v = await submit("sparks from the socket in the db lab", { dryRun: true });
    expect(v.status).toBe("needs_confirm");
  });

  it("a confidential report is never held back either, and its summary reveals nothing", async () => {
    hoisted.aiClear = false;
    const v = await submit("seniors are ragging first years", { dryRun: true });
    expect(v).toMatchObject({ status: "needs_confirm", confidential: true, summary: { confidential: true, problem: "", place: null } });
  });

  it("a missing field from an older AI answer counts as clear", async () => {
    hoisted.aiClear = undefined;
    expect((await submit("projector kharab hai db lab", { dryRun: true })).status).toBe("needs_confirm");
  });
});

describe("counter-question 2: where? and the confirmation", () => {
  it("clear problem, no place: asks where (a typed place settles it), then shows the summary", async () => {
    const ask = await submit("projector kharab hai", { dryRun: true });
    expect(ask.status).toBe("needs_place");
    const sum = await submit("projector kharab hai", { dryRun: true, placeText: "db lab" });
    expect(sum).toMatchObject({ status: "needs_confirm", summary: { place: { id: "cse-db-lab" } } });
  });

  it("an unknown place is asked about again, never guessed", async () => {
    const v = await submit("projector kharab hai Lab 9 mein", { dryRun: true });
    expect(v.status).toBe("needs_place");
    expect(db.reports.size).toBe(0);
  });

  it("NOTHING is saved or routed until the student confirms; confirming saves and routes it", async () => {
    const sum = await submit("projector kharab hai", { dryRun: true, placeText: "db lab" });
    expect(sum.status).toBe("needs_confirm");
    expect(db.reports.size).toBe(0);
    expect(db.issues.size).toBe(0);
    const sent = await submit("projector kharab hai", { placeText: "db lab" });
    expect(sent).toMatchObject({ status: "routed", issue: { department: "CSE" } });
    expect(db.issues.size).toBe(1);
  });

  it("the confirmation shows the problem and place only (no department: the AI decides that on send)", async () => {
    const v = await submit("WiFi is not working in the Networking Lab", { dryRun: true });
    expect(v.summary).toMatchObject({ place: { name: "Networking Lab" }, confidential: false });
    expect(JSON.stringify(v.summary)).not.toMatch(/department/i);
  });
});
