// Purpose: the ONLY Supabase client in the app. Server-only, service_role key, no session persistence.
// Everything else must go through src/lib/db/repositories. The anon key is never used.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

export class DbConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing environment variable(s): ${missing.join(", ")}`);
    this.name = "DbConfigError";
  }
}

export function missingDbEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

export function isDbConfigured(): boolean {
  return missingDbEnv().length === 0;
}

/** Round-trip counter for profiling (npm run perf). Counts requests only; never records URLs or bodies. */
type DbStats = { calls: number; ms: number };
const dbStatsOf = (): DbStats => ((globalThis as { __rfDbStats?: DbStats }).__rfDbStats ??= { calls: 0, ms: 0 });
export function readDbStats(): DbStats {
  return { ...dbStatsOf() };
}
export class DbTimeoutError extends Error {
  constructor(ms: number) {
    super(`Database request timed out after ${ms}ms`);
    this.name = "DbTimeoutError";
  }
}

/** Fail fast when Supabase hangs: the caller gets a clear error (-> friendly 503) instead of waiting forever. */
export function fetchWithTimeout(inner: typeof fetch, ms: number): typeof fetch {
  return async (input, init) => {
    const ctl = new AbortController();
    const outer = init?.signal;
    outer?.addEventListener("abort", () => ctl.abort(), { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The abort cancels a real fetch; the race guarantees we give up even if the transport ignores the signal.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctl.abort();
        reject(new DbTimeoutError(ms));
      }, ms);
    });
    try {
      return await Promise.race([inner(input, { ...init, signal: ctl.signal }), timeout]);
    } catch (e) {
      if (e instanceof DbTimeoutError) throw e;
      if (ctl.signal.aborted && !outer?.aborted) throw new DbTimeoutError(ms);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}

const countingFetch: typeof fetch = async (input, init) => {
  const t0 = performance.now();
  try {
    return await fetchWithTimeout(fetch, config.db.requestTimeoutMs)(input, init);
  } finally {
    const st = dbStatsOf();
    st.calls++;
    st.ms += performance.now() - t0;
  }
};

type GlobalWithDb = typeof globalThis & { __reportfixDb?: { sig: string; client: SupabaseClient } };

/** Lazily-created singleton (kept on globalThis to survive dev hot reloads). Throws DbConfigError if env is missing. */
export function getSupabase(): SupabaseClient {
  const missing = missingDbEnv();
  if (missing.length) throw new DbConfigError(missing);
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const sig = `${url}|${key.slice(-6)}`;
  const g = globalThis as GlobalWithDb;
  if (!g.__reportfixDb || g.__reportfixDb.sig !== sig) {
    g.__reportfixDb = {
      sig,
      client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: countingFetch } }),
    };
  }
  return g.__reportfixDb.client;
}
