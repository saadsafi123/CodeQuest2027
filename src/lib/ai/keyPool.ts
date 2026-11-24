// Purpose: Gemini API key pool with round-robin rotation, cooldowns, disabling and a hard attempt cap.
// SERVER ONLY. Keys come exclusively from env GEMINI_API_KEYS; they are never logged
// (only masked labels such as "key#2 (…ab12)") and never exposed by status().
import "server-only";
import { config } from "@/lib/config";

// ---------------------------------------------------------------- errors

/** Gemini refused to answer (safety block / prohibited content). Not retried: another key would also block. */
export class AiBlockedError extends Error {
  constructor(message = "AI response was blocked") {
    super(message);
    this.name = "AiBlockedError";
  }
}

/** Gemini answered but the output was empty or not valid JSON. Counts as a failed attempt. */
export class AiOutputError extends Error {
  constructor(message = "AI output was empty or invalid") {
    super(message);
    this.name = "AiOutputError";
  }
}

export class AiTimeoutError extends Error {
  constructor(ms: number) {
    super(`AI call timed out after ${ms}ms`);
    this.name = "AiTimeoutError";
  }
}

export type ErrorKind =
  | "rate_limit" // 429 / RESOURCE_EXHAUSTED / quota -> cooldown this key, try next
  | "invalid_key" // 401/403 or "API key not valid" -> disable this key
  | "model_unavailable" // 404 -> this key cannot use this model; disable only that pair
  | "transient" // 5xx / timeout / network -> backoff, then next key
  | "blocked" // safety block -> stop, fall back
  | "bad_output" // empty / invalid JSON -> failed attempt, try next key
  | "fatal"; // anything else (e.g. malformed request) -> stop, fall back

export interface ClassifiedError {
  kind: ErrorKind;
  /** Retry delay requested by the server (rate_limit only), in ms. */
  retryAfterMs?: number;
}

const DEFAULT_COOLDOWN_MS = config.ai.defaultCooldownMs;

function errStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } } | null;
  for (const v of [e?.status, e?.code, e?.response?.status]) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Extract a server-suggested retry delay from a Gemini error ("retryDelay":"34s" / "retry in 34.5s"). */
export function parseRetryDelayMs(err: unknown): number | undefined {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(text) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(text);
  if (!m) return undefined;
  const ms = Math.ceil(Number(m[1]) * 1000);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof AiBlockedError) return { kind: "blocked" };
  if (err instanceof AiOutputError) return { kind: "bad_output" };
  if (err instanceof AiTimeoutError) return { kind: "transient" };

  const status = errStatus(err);
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(msg)) {
    return { kind: "rate_limit", retryAfterMs: parseRetryDelayMs(err) };
  }
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|API key (not valid|expired)|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)
  ) {
    return { kind: "invalid_key" };
  }
  // 404 / "no longer available to new users": THIS key (project) cannot use THIS model. Other keys or other models may,
  // so disable only that key+model pair and keep rotating instead of giving up on AI altogether.
  if (status === 404 || /no longer available|NOT_FOUND|is not found for API version|not supported for generateContent/i.test(msg)) {
    return { kind: "model_unavailable" };
  }
  if (status !== undefined && (status >= 500 || status === 408)) return { kind: "transient" };
  if (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed|network|timed? ?out|socket hang up|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL/i.test(
      msg,
    )
  ) {
    return { kind: "transient" };
  }
  return { kind: "fatal" };
}

// ------------------------------------------------------------------ keys

/** Parse GEMINI_API_KEYS: comma-separated, trimmed, empty entries ignored, duplicates removed. */
export function parseKeys(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const k = part.trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export interface PoolStatus {
  mode: "gemini" | "fallback";
  keysTotal: number;
  keysAvailable: number;
  keysCoolingDown: number;
  keysDisabled: number;
  /** Model names (not secret). Empty = one unnamed model supplied by the caller. */
  models: string[];
  /** key x model pairs that can be used right now. */
  slotsAvailable: number;
  slotsTotal: number;
}

export interface AcquiredKey {
  index: number;
  key: string;
  label: string;
  /** Position in the model list and the model name ("" when the pool has no named models). */
  modelIndex: number;
  model: string;
}

export interface KeyPoolOptions {
  now?: () => number;
  defaultCooldownMs?: number;
  /** Index to start round-robin from (default 0). */
  startIndex?: number;
  /** Force fallback regardless of keys (AI_MODE=fallback). */
  forceFallback?: boolean;
  /** Ordered model preference. Quotas are per model, so the pool rotates keys within a model and falls to the next model. */
  models?: string[];
}

/**
 * Pool of key x model pairs. Order of use: the first model on every key (round-robin), then the second model, and so on.
 * 429 cools down ONE pair (quota is per model); 404 disables ONE pair (this key cannot use this model);
 * 401/403 disables the whole key.
 */
export class KeyPool {
  private readonly keys: string[];
  readonly models: string[];
  private readonly cooldownUntil: number[][]; // [key][model]
  private readonly pairDisabled: boolean[][]; // [key][model]
  private readonly keyDisabled: boolean[];
  private readonly cursor: number[]; // per model
  private readonly modelCooldownUntil: number[]; // a busy / slow model is skipped for every key
  private readonly modelFailStreak: number[]; // consecutive transient failures per model
  private readonly now: () => number;
  private readonly defaultCooldownMs: number;
  private readonly forceFallback: boolean;

  constructor(keys: string[], opts: KeyPoolOptions = {}) {
    this.keys = [...keys];
    const named = (opts.models ?? []).map((m) => m.trim()).filter(Boolean);
    this.models = named.length ? [...new Set(named)] : [""];
    this.cooldownUntil = this.keys.map(() => this.models.map(() => 0));
    this.pairDisabled = this.keys.map(() => this.models.map(() => false));
    this.keyDisabled = this.keys.map(() => false);
    this.now = opts.now ?? Date.now;
    this.defaultCooldownMs = opts.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS;
    const start = this.keys.length ? (opts.startIndex ?? 0) % this.keys.length : 0;
    this.cursor = this.models.map(() => start);
    this.modelCooldownUntil = this.models.map(() => 0);
    this.modelFailStreak = this.models.map(() => 0);
    this.forceFallback = opts.forceFallback ?? false;
  }

  get size(): number {
    return this.keys.length;
  }

  get modelCount(): number {
    return this.models.length;
  }

  /** True when the pool names its models (otherwise the caller supplies one). */
  get hasNamedModels(): boolean {
    return this.models[0] !== "";
  }

  /** Masked label safe for logs, e.g. "key#2 (…ab12)". */
  label(index: number): string {
    const k = this.keys[index] ?? "";
    return `key#${index + 1} (…${k.slice(-4)})`;
  }

  private pairAvailable(i: number, m: number): boolean {
    return !this.keyDisabled[i] && !this.pairDisabled[i][m] && this.cooldownUntil[i][m] <= this.now() && this.modelCooldownUntil[m] <= this.now();
  }

  /** A call succeeded: the model is healthy again. */
  reportSuccess(slot: AcquiredKey): void {
    this.modelFailStreak[slot.modelIndex] = 0;
  }

  /**
   * A call failed for a transient reason (503 / timeout / network). Busy models are busy for everyone, so after
   * `streak` consecutive failures the MODEL is skipped for `ms` (a circuit breaker): later requests go to the next
   * model or straight to the rules fallback instead of each waiting for its own timeout.
   */
  reportTransient(slot: AcquiredKey, streak: number, ms: number): void {
    const m = slot.modelIndex;
    this.modelFailStreak[m]++;
    if (this.modelFailStreak[m] >= streak) {
      this.modelCooldownUntil[m] = this.now() + ms;
      this.modelFailStreak[m] = 0;
    }
  }

  /** Next available pair: first model with a usable key (round-robin over keys), or null if none. */
  acquire(): AcquiredKey | null {
    if (this.forceFallback) return null;
    const n = this.keys.length;
    for (let m = 0; m < this.models.length; m++) {
      for (let step = 0; step < n; step++) {
        const i = (this.cursor[m] + step) % n;
        if (this.pairAvailable(i, m)) {
          this.cursor[m] = (i + 1) % n;
          return { index: i, key: this.keys[i], label: this.label(i), modelIndex: m, model: this.models[m] };
        }
      }
    }
    return null;
  }

  /** Cool down one pair (when given an acquired slot) or the whole key (when given an index). */
  cooldown(target: number | AcquiredKey, ms?: number): void {
    const d = ms && ms > 0 ? ms : this.defaultCooldownMs;
    const until = this.now() + d;
    if (typeof target === "number") this.cooldownUntil[target] = this.models.map(() => until);
    else this.cooldownUntil[target.index][target.modelIndex] = until;
  }

  /** Disable the whole key (401/403). */
  disable(index: number): void {
    this.keyDisabled[index] = true;
  }

  /** Disable one key+model pair (404: this project cannot use this model). */
  disableModel(slot: AcquiredKey): void {
    this.pairDisabled[slot.index][slot.modelIndex] = true;
  }

  /** Counts only. Never includes key material. */
  status(): PoolStatus {
    const t = this.now();
    let available = 0;
    let cooling = 0;
    let disabled = 0;
    let slots = 0;
    for (let i = 0; i < this.keys.length; i++) {
      let usable = 0;
      let coolingPairs = 0;
      for (let m = 0; m < this.models.length; m++) {
        if (this.pairAvailable(i, m)) usable++;
        else if (!this.keyDisabled[i] && !this.pairDisabled[i][m] && (this.cooldownUntil[i][m] > t || this.modelCooldownUntil[m] > t)) coolingPairs++;
      }
      slots += usable;
      if (usable > 0) available++;
      else if (coolingPairs > 0) cooling++;
      else disabled++;
    }
    if (this.forceFallback) {
      available = 0;
      slots = 0;
    }
    return {
      mode: !this.forceFallback && available > 0 ? "gemini" : "fallback",
      keysTotal: this.keys.length,
      keysAvailable: available,
      keysCoolingDown: cooling,
      keysDisabled: disabled,
      models: this.hasNamedModels ? [...this.models] : [],
      slotsAvailable: slots,
      slotsTotal: this.keys.length * this.models.length,
    };
  }
}

// ---------------------------------------------------------- run with pool

export type PoolResult<T> =
  | { ok: true; mode: "gemini"; value: T; attempts: number }
  | { ok: false; mode: "fallback"; reason: string; attempts: number };

export interface RunOptions {
  /** Hard cap on attempts across all keys. Default: number of keys + 2. */
  maxAttempts?: number;
  /** Per-call timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Consecutive transient failures before a model is skipped (default from config). */
  breakerStreak?: number;
  /** Wall-clock budget for all attempts of one task. */
  totalBudgetMs?: number;
  backoffBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Receives masked, key-free diagnostics. */
  log?: (msg: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Run `fn` with a key from the pool, rotating/cooling/disabling keys as errors dictate.
 * Never throws: when AI cannot be used it returns { ok:false, mode:"fallback" } so the caller
 * can switch to the rule-based extractor. Bounded by maxAttempts and a per-call timeout.
 */
export async function runWithKeyPool<T>(
  pool: KeyPool,
  fn: (apiKey: string, label: string, model: string) => Promise<T>,
  opts: RunOptions = {},
): Promise<PoolResult<T>> {
  const maxAttempts = opts.maxAttempts ?? pool.size + pool.modelCount - 1 + config.ai.extraAttemptsOverKeyCount;
  const timeoutMs = opts.timeoutMs ?? config.ai.callTimeoutMs;
  const totalBudgetMs = opts.totalBudgetMs ?? config.ai.totalBudgetMs;
  const backoffBase = opts.backoffBaseMs ?? config.ai.transientBackoffBaseMs;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const log = opts.log ?? (() => {});

  let attempts = 0;
  let transientCount = 0;
  let lastReason = "no_keys_available";

  const startedAt = Date.now();
  while (attempts < maxAttempts) {
    if (Date.now() - startedAt >= totalBudgetMs) {
      lastReason = "time_budget_exhausted";
      break;
    }
    const acquired = pool.acquire();
    if (!acquired) {
      lastReason = pool.size === 0 ? "no_keys_configured" : "all_keys_unavailable";
      break;
    }
    attempts++;
    // never let one attempt run past the task budget
    const attemptTimeout = Math.max(300, Math.min(timeoutMs, totalBudgetMs - (Date.now() - startedAt)));
    try {
      const value = await withTimeout(fn(acquired.key, acquired.label, acquired.model), attemptTimeout);
      pool.reportSuccess(acquired);
      return { ok: true, mode: "gemini", value, attempts };
    } catch (err) {
      const c = classifyError(err);
      lastReason = c.kind;
      log(`${acquired.label}${acquired.model ? ` ${acquired.model}` : ""}: ${c.kind}`);
      switch (c.kind) {
        case "rate_limit":
          pool.cooldown(acquired, c.retryAfterMs);
          break; // immediately try the next key
        case "invalid_key":
          pool.disable(acquired.index);
          break;
        case "model_unavailable":
          pool.disableModel(acquired);
          break;
        case "transient": {
          pool.reportTransient(acquired, opts.breakerStreak ?? config.ai.modelFailStreakToCooldown, config.ai.modelCooldownMs);
          const delay = backoffBase * 2 ** transientCount + Math.floor(random() * backoffBase);
          transientCount++;
          await sleep(delay);
          break;
        }
        case "bad_output":
          break; // failed attempt; capped by maxAttempts
        case "blocked":
        case "fatal":
          return { ok: false, mode: "fallback", reason: c.kind, attempts };
      }
    }
  }
  return { ok: false, mode: "fallback", reason: lastReason, attempts };
}

// ------------------------------------------------------- process singleton

type GlobalWithPool = typeof globalThis & { __reportfixKeyPool?: { sig: string; pool: KeyPool } };

/** Shared pool, kept on globalThis so Next.js dev hot-reloads don't reset cooldowns. */
/** Ordered model list: GEMINI_MODELS (comma-separated) wins, else the single GEMINI_MODEL. */
export function parseModels(models: string | undefined | null, single?: string | undefined | null): string[] {
  const raw = models?.trim() ? models : (single ?? "");
  return parseKeys(raw);
}

export function getKeyPool(): KeyPool {
  const raw = process.env.GEMINI_API_KEYS ?? "";
  const models = parseModels(process.env.GEMINI_MODELS, process.env.GEMINI_MODEL);
  const forceFallback = (process.env.AI_MODE ?? "auto").trim().toLowerCase() === "fallback";
  const sig = `${forceFallback}|${raw}|${models.join(",")}`;
  const g = globalThis as GlobalWithPool;
  if (!g.__reportfixKeyPool || g.__reportfixKeyPool.sig !== sig) {
    g.__reportfixKeyPool = { sig, pool: new KeyPool(parseKeys(raw), { forceFallback, models }) };
  }
  return g.__reportfixKeyPool.pool;
}

/** Safe status for the UI banner and /api/ai/status: counts only, never keys. */
export function getAiStatus(): PoolStatus {
  return getKeyPool().status();
}
