// Purpose: database health check used by `npm run db:check` and the status banner.
// Returns beginner-friendly problems instead of throwing.
import "server-only";
import { getSupabase, missingDbEnv } from "./supabase";

export const REQUIRED_TABLES = [
  "users",
  "issues",
  "reports",
  "issue_members",
  "issue_updates",
  "resolution_votes",
  "trust_events",
  "audit_log",
] as const;

export type DbState = "connected" | "not_configured" | "unreachable" | "schema_missing";

export interface DbCheckResult {
  state: DbState;
  ok: boolean;
  message: string;
  /** Exact things for the user to fix, in order. */
  fixes: string[];
  missingTables: string[];
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    Promise.resolve(p).then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export async function checkDatabase(timeoutMs = 5000): Promise<DbCheckResult> {
  const missing = missingDbEnv();
  if (missing.length) {
    return {
      state: "not_configured",
      ok: false,
      message: `Missing environment variable(s): ${missing.join(", ")}.`,
      fixes: [
        "Copy .env.example to .env.local (in the project root).",
        `Fill in ${missing.join(" and ")} from Supabase: Project Settings -> API (Project URL and the service_role key).`,
        "Restart the dev server / re-run this command.",
      ],
      missingTables: [],
    };
  }

  const db = getSupabase();
  const missingTables: string[] = [];
  try {
    for (const table of REQUIRED_TABLES) {
      const { error } = await withTimeout(db.from(table).select("*", { count: "exact", head: true }), timeoutMs);
      if (error) {
        const code = (error as { code?: string }).code ?? "";
        const text = `${error.message ?? ""}`;
        if (code === "PGRST205" || code === "42P01" || /could not find the table|does not exist/i.test(text)) {
          missingTables.push(table);
        } else if (/invalid api key|jwt/i.test(text)) {
          return {
            state: "unreachable",
            ok: false,
            message: "Supabase rejected the key.",
            fixes: ["Check SUPABASE_SERVICE_ROLE_KEY in .env.local: it must be the service_role key (not the anon key), copied in full."],
            missingTables: [],
          };
        } else if (/fetch failed|network|timed out|ENOTFOUND|ECONN/i.test(text) || text === "") {
          throw new Error(text || "network error");
        } else {
          return {
            state: "unreachable",
            ok: false,
            message: `Supabase returned an error: ${text}`,
            fixes: ["Check SUPABASE_URL / key, and that the project is not paused (free projects pause when idle)."],
            missingTables: [],
          };
        }
      }
    }
  } catch (e) {
    return {
      state: "unreachable",
      ok: false,
      message: `Cannot reach Supabase (${e instanceof Error ? e.message : String(e)}).`,
      fixes: [
        "Check your internet connection / venue network.",
        "Check SUPABASE_URL is exactly the Project URL (https://xxxx.supabase.co).",
        "Open the Supabase dashboard: free projects pause when idle - click Restore if it is paused.",
      ],
      missingTables: [],
    };
  }

  if (missingTables.length) {
    return {
      state: "schema_missing",
      ok: false,
      message: `Connected, but table(s) are missing: ${missingTables.join(", ")}.`,
      fixes: [
        "Open Supabase -> SQL Editor -> New query.",
        "Paste the full contents of src/lib/db/schema.sql and click Run.",
        "If the tables still are not found, wait ~10s (schema cache refresh) and re-run this check.",
      ],
      missingTables,
    };
  }

  // Functions: rebuild_trust_scores is harmless to call and proves the SQL functions were created.
  const { error: fnError } = await db.rpc("rebuild_trust_scores");
  if (fnError) {
    return {
      state: "schema_missing",
      ok: false,
      message: `Tables exist, but SQL functions are missing or broken (${fnError.message}).`,
      fixes: ["Re-run the full src/lib/db/schema.sql in the Supabase SQL Editor (it is safe to run repeatedly)."],
      missingTables: [],
    };
  }

  // Phase 5-6 functions: the last block of schema.sql. A harmless read proves the newest schema was applied.
  const { error: newFn } = await db.rpc("student_issues", { p_user_id: "00000000-0000-0000-0000-000000000000" });
  const { error: newCol } = await db.from("issue_members").select("excluded").limit(1);
  // voting window / pool (fixes pass 2)
  const { error: poolErr } = await db.from("resolution_pool").select("issue_id").limit(1);
  const { error: windowErr } = await db.from("issues").select("vote_deadline").limit(1);
  const { error: settleErr } = await db.rpc("settle_resolution", { p_issue_id: "00000000-0000-0000-0000-000000000000", p_cfg: {} });
  if (newFn || newCol || poolErr || windowErr || settleErr) {
    return {
      state: "schema_missing",
      ok: false,
      message: "The database schema is older than the app (voting / trust / speed functions are missing).",
      fixes: ["Re-run the full src/lib/db/schema.sql in the Supabase SQL Editor (safe to run repeatedly), wait ~10 seconds, then re-check."],
      missingTables: [],
    };
  }

  return { state: "connected", ok: true, message: "Database connected and schema is present.", fixes: [], missingTables: [] };
}
