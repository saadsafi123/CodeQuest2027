import { describe, expect, it, vi } from "vitest";
import {
  AiBlockedError,
  AiOutputError,
  KeyPool,
  classifyError,
  parseKeys,
  parseRetryDelayMs,
  runWithKeyPool,
} from "@/lib/ai/keyPool";

function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const apiErr = (status: number, message = "boom") => Object.assign(new Error(message), { status });
const noSleep = () => Promise.resolve();

describe("parseKeys", () => {
  it("trims, drops empties and de-duplicates", () => {
    expect(parseKeys(" a , b,, a ,c ,")).toEqual(["a", "b", "c"]);
    expect(parseKeys("")).toEqual([]);
    expect(parseKeys(undefined)).toEqual([]);
  });
});

describe("classifyError", () => {
  it("maps statuses and messages", () => {
    expect(classifyError(apiErr(429)).kind).toBe("rate_limit");
    expect(classifyError(new Error("RESOURCE_EXHAUSTED: quota exceeded")).kind).toBe("rate_limit");
    expect(classifyError(apiErr(403)).kind).toBe("invalid_key");
    expect(classifyError(apiErr(400, "API key not valid. Please pass a valid API key.")).kind).toBe("invalid_key");
    expect(classifyError(apiErr(400, "Invalid JSON payload")).kind).toBe("fatal");
    expect(classifyError(apiErr(404, "This model models/x is no longer available to new users")).kind).toBe("model_unavailable");
    expect(classifyError(apiErr(503)).kind).toBe("transient");
    expect(classifyError(new Error("fetch failed")).kind).toBe("transient");
    expect(classifyError(new AiBlockedError()).kind).toBe("blocked");
    expect(classifyError(new AiOutputError()).kind).toBe("bad_output");
  });
  it("reads the retry delay from the error", () => {
    const e = apiErr(429, 'RESOURCE_EXHAUSTED {"retryDelay":"34s"}');
    expect(parseRetryDelayMs(e)).toBe(34_000);
    expect(classifyError(e).retryAfterMs).toBe(34_000);
    expect(parseRetryDelayMs(new Error("Please retry in 2.5s"))).toBe(2500);
    expect(parseRetryDelayMs(new Error("nothing"))).toBeUndefined();
  });
});

describe("KeyPool", () => {
  it("round-robins across keys", () => {
    const pool = new KeyPool(["k1", "k2", "k3"]);
    expect([0, 1, 2, 3].map(() => pool.acquire()!.index)).toEqual([0, 1, 2, 0]);
  });

  it("honours cooldown and releases the key after it expires", () => {
    const clock = makeClock();
    const pool = new KeyPool(["k1", "k2"], { now: clock.now });
    pool.cooldown(0, 10_000);
    expect(pool.status()).toMatchObject({ keysAvailable: 1, keysCoolingDown: 1 });
    expect(pool.acquire()!.index).toBe(1);
    expect(pool.acquire()!.index).toBe(1); // key 0 still cooling
    clock.advance(10_001);
    expect(pool.status()).toMatchObject({ keysAvailable: 2, keysCoolingDown: 0 });
    const seen = new Set([pool.acquire()!.index, pool.acquire()!.index]);
    expect(seen).toEqual(new Set([0, 1]));
  });

  it("uses a 60s default cooldown", () => {
    const clock = makeClock();
    const pool = new KeyPool(["k1"], { now: clock.now });
    pool.cooldown(0);
    clock.advance(59_000);
    expect(pool.acquire()).toBeNull();
    clock.advance(1_001);
    expect(pool.acquire()).not.toBeNull();
  });

  it("never exposes key material in labels or status", () => {
    const pool = new KeyPool(["SECRETKEY-abcd1234", "SECRETKEY-zzzz9999"]);
    expect(pool.label(1)).toBe("key#2 (…9999)");
    expect(JSON.stringify(pool.status())).not.toContain("SECRET");
  });

  it("forceFallback reports fallback mode with zero available keys", () => {
    const pool = new KeyPool(["k1"], { forceFallback: true });
    expect(pool.acquire()).toBeNull();
    expect(pool.status()).toMatchObject({ mode: "fallback", keysTotal: 1, keysAvailable: 0 });
  });
});

describe("runWithKeyPool", () => {
  it("rotates to the next key on 429 and cools the first one down", async () => {
    const clock = makeClock();
    const pool = new KeyPool(["k1", "k2", "k3"], { now: clock.now });
    const used: string[] = [];
    const res = await runWithKeyPool(
      pool,
      async (key) => {
        used.push(key);
        if (key === "k1") throw apiErr(429, 'RESOURCE_EXHAUSTED {"retryDelay":"20s"}');
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(res).toMatchObject({ ok: true, mode: "gemini", value: "ok", attempts: 2 });
    expect(used).toEqual(["k1", "k2"]);
    expect(pool.status().keysCoolingDown).toBe(1);
    clock.advance(20_001);
    expect(pool.status().keysCoolingDown).toBe(0);
  });

  it("disables a key that is rejected as invalid and keeps it disabled", async () => {
    const pool = new KeyPool(["bad", "good"]);
    const res = await runWithKeyPool(
      pool,
      async (key) => {
        if (key === "bad") throw apiErr(403, "PERMISSION_DENIED");
        return key;
      },
      { sleep: noSleep },
    );
    expect(res).toMatchObject({ ok: true, value: "good" });
    expect(pool.status()).toMatchObject({ keysDisabled: 1, keysAvailable: 1 });
    for (let i = 0; i < 5; i++) expect(pool.acquire()!.key).toBe("good");
  });

  it("falls back when every key is rate limited, without throwing", async () => {
    const pool = new KeyPool(["k1", "k2"]);
    const fn = vi.fn(async () => {
      throw apiErr(429);
    });
    const res = await runWithKeyPool(pool, fn, { sleep: noSleep });
    expect(res).toMatchObject({ ok: false, mode: "fallback" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("falls back immediately when no keys are configured", async () => {
    const res = await runWithKeyPool(new KeyPool([]), async () => "x", { sleep: noSleep });
    expect(res).toMatchObject({ ok: false, mode: "fallback", reason: "no_keys_configured", attempts: 0 });
  });

  it("caps attempts (keys + 2) on repeated transient errors, with exponential backoff", async () => {
    const pool = new KeyPool(["k1", "k2"]);
    const sleeps: number[] = [];
    const fn = vi.fn(async () => {
      throw apiErr(503);
    });
    const res = await runWithKeyPool(pool, fn, {
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0,
      backoffBaseMs: 100,
      breakerStreak: 99, // this test is about the attempt cap and backoff, not the circuit breaker
    });
    expect(res).toMatchObject({ ok: false, mode: "fallback", reason: "transient", attempts: 4 });
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([100, 200, 400, 800]);
  });

  it("stops at once on a safety block (no endless retry)", async () => {
    const pool = new KeyPool(["k1", "k2", "k3"]);
    const fn = vi.fn(async () => {
      throw new AiBlockedError();
    });
    const res = await runWithKeyPool(pool, fn, { sleep: noSleep });
    expect(res).toMatchObject({ ok: false, mode: "fallback", reason: "blocked", attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("counts invalid output as a failed attempt and tries another key, within the cap", async () => {
    const pool = new KeyPool(["k1", "k2"]);
    const fn = vi.fn(async (key: string) => {
      if (key === "k1") throw new AiOutputError();
      return "good";
    });
    const res = await runWithKeyPool(pool, fn, { sleep: noSleep });
    expect(res).toMatchObject({ ok: true, value: "good", attempts: 2 });

    const always = vi.fn(async () => {
      throw new AiOutputError();
    });
    const res2 = await runWithKeyPool(new KeyPool(["a", "b"]), always, { sleep: noSleep });
    expect(res2.ok).toBe(false);
    expect(always.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("times out a hanging call and does not hang the caller", async () => {
    const pool = new KeyPool(["k1"]);
    const res = await runWithKeyPool(pool, () => new Promise<string>(() => {}), {
      timeoutMs: 20,
      sleep: noSleep,
      maxAttempts: 1,
    });
    expect(res).toMatchObject({ ok: false, mode: "fallback", reason: "transient" });
  });
});

describe("model rotation", () => {
  it("prefers the first model on every key, then falls to the next model", () => {
    const pool = new KeyPool(["k1", "k2"], { models: ["m1", "m2"] });
    const a = pool.acquire()!;
    const b = pool.acquire()!;
    expect([a.model, b.model]).toEqual(["m1", "m1"]);
    expect(new Set([a.index, b.index])).toEqual(new Set([0, 1]));
    pool.cooldown(a, 60_000);
    pool.cooldown(b, 60_000);
    expect(pool.acquire()!.model).toBe("m2");
  });

  it("a 429 cools down only that key+model pair (quota is per model)", async () => {
    const pool = new KeyPool(["k1"], { models: ["m1", "m2"] });
    const seen: string[] = [];
    const res = await runWithKeyPool(
      pool,
      async (_k, _l, model) => {
        seen.push(model);
        if (model === "m1") throw apiErr(429, "quota");
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(res).toMatchObject({ ok: true, value: "ok" });
    expect(seen).toEqual(["m1", "m2"]);
    expect(pool.acquire()!.model).toBe("m2"); // m1 on k1 is still cooling
  });

  it("a 404 disables only that model for that key; other keys and models keep working", async () => {
    const pool = new KeyPool(["k1", "k2"], { models: ["m1", "m2"] });
    const res = await runWithKeyPool(
      pool,
      async (key, _l, model) => {
        if (key === "k1" && model === "m1") throw apiErr(404, "model not found");
        return `${key}/${model}`;
      },
      { sleep: noSleep },
    );
    expect(res).toMatchObject({ ok: true, value: "k2/m1" });
    // k1 is still usable on m2
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const s = pool.acquire()!;
      seen.add(`${s.index}/${s.model}`);
    }
    expect(seen.has("0/m1")).toBe(false);
    expect(pool.status()).toMatchObject({ keysDisabled: 0, models: ["m1", "m2"] });
  });

  it("a 403 disables the key for every model; status counts slots", () => {
    const pool = new KeyPool(["k1", "k2"], { models: ["m1", "m2"] });
    pool.disable(0);
    expect(pool.status()).toMatchObject({ keysDisabled: 1, keysAvailable: 1, slotsAvailable: 2, slotsTotal: 4 });
  });

  it("falls back only when every key+model pair is spent, and never exposes keys", async () => {
    const pool = new KeyPool(["SECRET-1", "SECRET-2"], { models: ["m1", "m2"] });
    const res = await runWithKeyPool(
      pool,
      async () => {
        throw apiErr(404, "nope");
      },
      { sleep: noSleep },
    );
    expect(res).toMatchObject({ ok: false, mode: "fallback" });
    expect(pool.status().mode).toBe("fallback");
    expect(JSON.stringify(pool.status())).not.toContain("SECRET");
  });

  it("parseModels prefers GEMINI_MODELS and falls back to GEMINI_MODEL", async () => {
    const { parseModels } = await import("@/lib/ai/keyPool");
    expect(parseModels(" a, b ,a", "z")).toEqual(["a", "b"]);
    expect(parseModels("", "z")).toEqual(["z"]);
    expect(parseModels(undefined, undefined)).toEqual([]);
  });
});

describe("time budget and thinking config", () => {
  it("stops trying once the wall-clock budget is spent", async () => {
    const pool = new KeyPool(["k1", "k2", "k3", "k4"]);
    let calls = 0;
    const res = await runWithKeyPool(
      pool,
      async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 30));
        throw apiErr(503, "busy");
      },
      { sleep: noSleep, totalBudgetMs: 50 },
    );
    expect(res).toMatchObject({ ok: false, mode: "fallback", reason: "time_budget_exhausted" });
    expect(calls).toBeLessThan(4);
  });

  it("turns thinking off for 2.5 and to minimal for 3.x", async () => {
    const { thinkingFor } = await import("@/lib/ai/client");
    expect(thinkingFor("gemini-2.5-flash")).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    expect(thinkingFor("gemini-3.5-flash")).toEqual({ thinkingConfig: { thinkingLevel: "minimal" } });
    expect(thinkingFor("other")).toEqual({});
  });
});

describe("circuit breaker for busy models", () => {
  it("two consecutive transient failures put the MODEL on cooldown for every key; the next model takes over", async () => {
    const clock = makeClock();
    const pool = new KeyPool(["k1", "k2", "k3"], { models: ["m1", "m2"], now: clock.now });
    const seen: string[] = [];
    const res = await runWithKeyPool(
      pool,
      async (_k, _l, model) => {
        seen.push(model);
        if (model === "m1") throw apiErr(503, "busy");
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(res).toMatchObject({ ok: true, value: "ok" });
    expect(seen).toEqual(["m1", "m1", "m2"]); // third key never tried on the busy model
    // a later request skips m1 entirely
    expect(pool.acquire()!.model).toBe("m2");
    expect(pool.status()).toMatchObject({ keysAvailable: 3 });
    // and the model comes back after the cooldown
    clock.advance(21_000);
    expect(pool.acquire()!.model).toBe("m1");
  });

  it("a success resets the streak, so one blip never trips the breaker", async () => {
    const pool = new KeyPool(["k1", "k2"], { models: ["m1"] });
    let n = 0;
    const flaky = async () => {
      if (++n === 1) throw apiErr(503, "blip");
      return "ok";
    };
    await runWithKeyPool(pool, flaky, { sleep: noSleep });
    await runWithKeyPool(pool, async () => "ok", { sleep: noSleep });
    n = 0;
    await runWithKeyPool(pool, flaky, { sleep: noSleep }); // blip again: streak was reset, no cooldown
    expect(pool.acquire()).not.toBeNull();
  });

  it("when every model is tripped, requests fall back at once without calling Gemini", async () => {
    const pool = new KeyPool(["k1", "k2"], { models: ["m1"] });
    const fn = vi.fn(async () => {
      throw apiErr(503, "busy");
    });
    await runWithKeyPool(pool, fn, { sleep: noSleep });
    const calls = fn.mock.calls.length;
    const again = await runWithKeyPool(pool, fn, { sleep: noSleep });
    expect(again).toMatchObject({ ok: false, mode: "fallback" });
    expect(fn.mock.calls.length).toBe(calls); // no new call
  });

  it("an attempt never runs past the total budget", async () => {
    const pool = new KeyPool(["k1", "k2", "k3"]);
    const t0 = Date.now();
    const res = await runWithKeyPool(pool, () => new Promise<string>(() => {}), { sleep: noSleep, timeoutMs: 5_000, totalBudgetMs: 400 });
    expect(res.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
