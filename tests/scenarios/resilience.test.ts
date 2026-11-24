// Phase 7: infrastructure failures. All Gemini keys failing (rate limits, blocks, hangs) and a slow / unreachable
// database must degrade gracefully: reports are still processed, nothing crashes, errors are friendly and key-free.
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ mode: "429" as "429" | "blocked" | "hang" | "ok", calls: 0 }));
vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => {
        hoisted.calls++;
        if (hoisted.mode === "429") throw Object.assign(new Error('RESOURCE_EXHAUSTED {"retryDelay":"60s"}'), { status: 429 });
        if (hoisted.mode === "blocked") return { promptFeedback: { blockReason: "SAFETY" }, candidates: [], text: "" };
        if (hoisted.mode === "hang") return new Promise(() => {});
        return { text: "{}", candidates: [{ finishReason: "STOP" }] };
      },
    };
  },
}));

import { addAdmin, addStudent, db, resetFakes } from "../fakes";
import { getAiStatus, KeyPool } from "@/lib/ai/keyPool";
import { analyzeReport } from "@/lib/ai/analyze";
import { config } from "@/lib/config";
import { DbTimeoutError, fetchWithTimeout } from "@/lib/db/supabase";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { clearAnalysisCache, ingestReport } from "@/lib/services/reportService";

beforeEach(() => {
  resetFakes();
  clearAnalysisCache();
  hoisted.calls = 0;
  hoisted.mode = "429";
  process.env.GEMINI_API_KEYS = "key-aaaa1111,key-bbbb2222,key-cccc3333";
  process.env.GEMINI_MODELS = "model-one,model-two";
  delete process.env.AI_MODE;
  // fresh pool for every test (the real one lives on globalThis)
  delete (globalThis as { __reportfixKeyPool?: unknown }).__reportfixKeyPool;
});

describe("every Gemini key failing (#12, #13)", () => {
  it("all key+model pairs rate-limited: the report is still processed in fallback mode, and the status says so", async () => {
    const s = addStudent("S");
    const v = await ingestReport(s as never, "projector kharab hai networking lab mein");
    expect(v.issue).toMatchObject({ department: "CSE" });
    expect(db.reports.size).toBe(1);
    const stored = [...db.reports.values()][0];
    expect(stored.aiMode).toBe("fallback");
    expect(hoisted.calls).toBeGreaterThan(0);
    expect(hoisted.calls).toBeLessThanOrEqual(3 * 2 + 2); // bounded: keys x models + a little
    const st = getAiStatus();
    expect(st).toMatchObject({ mode: "fallback", keysAvailable: 0, keysCoolingDown: 3, slotsAvailable: 0, slotsTotal: 6 });
    expect(JSON.stringify(st)).not.toContain("key-aaaa");
  });

  it("once everything is cooling down, the next report makes no Gemini call at all (fast)", async () => {
    await ingestReport(addStudent("A") as never, "projector kharab hai networking lab mein");
    const before = hoisted.calls;
    const t0 = Date.now();
    await ingestReport(addStudent("B") as never, "wifi nahi chal raha DB lab mein");
    expect(hoisted.calls).toBe(before);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("a Gemini safety block on a harassment report: the regex net still makes it confidential (#13)", async () => {
    hoisted.mode = "blocked";
    const v = await ingestReport(addStudent("Z") as never, "Seniors are ragging first year students behind the cafeteria");
    expect(v.confidential).toBe(true);
    expect([...db.issues.values()][0]).toMatchObject({ isConfidential: true, department: null });
  });

  it("a hanging Gemini call is abandoned within the time budget and the rules take over", async () => {
    hoisted.mode = "hang";
    const t0 = Date.now();
    const r = await analyzeReport("projector kharab hai networking lab mein", {
      pool: new KeyPool(["k1", "k2"], { models: ["m1"] }),
      caller: () => new Promise(() => {}),
    });
    expect(r.mode).toBe("fallback");
    expect(Date.now() - t0).toBeLessThan(config.ai.totalBudgetMs + config.ai.callTimeoutMs + 1500);
  }, 30_000);

  it("a safety hazard is still critical when every AI call fails (rules are the safety net)", async () => {
    const v = await ingestReport(addStudent("F") as never, "db lab ke plug se chingariyan nikal rahi hain, bas bata raha hun");
    expect(v.issue?.priority).toBe("critical");
  });
});

describe("slow or unreachable database (#14)", () => {
  it("a hung request is abandoned after the timeout with a clear error", async () => {
    const hung = (() => new Promise(() => {})) as unknown as typeof fetch;
    await expect(fetchWithTimeout(hung, 30)("https://example.invalid/x")).rejects.toBeInstanceOf(DbTimeoutError);
  });

  it("a slow but answering request is untouched", async () => {
    const slow = (async () => {
      await new Promise((r) => setTimeout(r, 40));
      return new Response("ok");
    }) as unknown as typeof fetch;
    const res = await fetchWithTimeout(slow, 500)("https://example.invalid/x");
    expect(await res.text()).toBe("ok");
  });

  it("a caller who aborts first is not reported as a database timeout", async () => {
    const ctl = new AbortController();
    const abortable = ((_u: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    const p = fetchWithTimeout(abortable, 5_000)("https://example.invalid/x", { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.not.toBeInstanceOf(DbTimeoutError);
  });

  it("route errors become a friendly 503 that leaks no internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = await respond(async () => {
      throw new DbTimeoutError(10_000);
    });
    expect(timeout.status).toBe(503);
    const body = await timeout.json();
    expect(body.error).toMatch(/slow or unreachable.*try again/i);
    expect(JSON.stringify(body)).not.toMatch(/10000|supabase|SELECT|stack/i);

    const boom = await respond(async () => {
      throw new Error('relation "users" does not exist at 10.0.0.5 password=hunter2');
    });
    expect(boom.status).toBe(503);
    expect(JSON.stringify(await boom.json())).not.toMatch(/relation|10\.0\.0\.5|hunter2/);

    const known = await respond(async () => {
      throw new ServiceError("not_found", "Issue not found.");
    });
    expect(known.status).toBe(404);
  });

  it("a report is saved before routing, so a database that dies mid-way never loses it", async () => {
    db.failNext.attachNew = 10;
    const admin = addAdmin();
    const v = await ingestReport(addStudent("S") as never, "projector kharab hai networking lab mein");
    expect(v.needsAttention).toBe(true);
    expect(db.reports.size).toBe(1);
    expect(admin.role).toBe("admin");
  });
});
