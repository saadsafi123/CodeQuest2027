// Purpose: `npm run perf` profiles the main service calls against the live database: wall time and Supabase round trips
// per call. WIPES AND RESEEDS demo data first (same as db:reset). Re-run after a change to compare.
import { analyzeReport } from "@/lib/ai/analyze";
import { readDbStats } from "@/lib/db/supabase";
import { userRepository } from "@/lib/db/repositories";
import { resetAllData } from "@/lib/services/adminService";
import { adminOverview, changeStatus, getIssueDetail, listMyIssues, listQueue } from "@/lib/services/issueService";
import { ingestReport } from "@/lib/services/reportService";
import { getUser } from "@/lib/services/userService";

const rows: { name: string; ms: number; calls: number }[] = [];

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const before = readDbStats();
  const t0 = performance.now();
  const out = await fn();
  const ms = performance.now() - t0;
  rows.push({ name, ms, calls: readDbStats().calls - before.calls });
  console.log(`  done: ${name} ${Math.round(ms)} ms, ${readDbStats().calls - before.calls} db calls`);
  return out;
}

async function main() {
  await resetAllData();
  const users = await userRepository.list();
  const by = (n: string) => users.find((u) => u.name.includes(n))!;
  const ayesha = by("Ayesha");
  const bilal = by("Bilal");
  const zain = by("Zain");
  const staff = users.find((u) => u.role === "staff" && u.department === "CSE")!;
  const admin = users.find((u) => u.role === "admin")!;

  await step("auth: getUser (every page/API call)", () => getUser(ayesha.id));
  await step("AI only: analyzeReport", () => analyzeReport("projector kharab hai networking lab mein"));
  const first = await step("report #1 (new issue)", () => ingestReport(ayesha, "projector kharab hai networking lab mein"));
  await step("report #2 (same problem, joins: compare)", () => ingestReport(bilal, "networking lab ka projecter nahi chal raha"));
  await step("report #3 (unknown place -> clarify)", () => ingestReport(ayesha, "AC is not working in Room 999 of the Quantum Block"));
  await step("report #4 (confidential)", () => ingestReport(zain, "Seniors are ragging first year students behind the cafeteria"));
  await step("student dashboard: listMyIssues", () => listMyIssues(ayesha));
  await step("staff queue: listQueue", () => listQueue(staff));
  await step("admin overview", () => adminOverview(admin));
  const id = first.issue!.id;
  await step("issue detail (student)", () => getIssueDetail(ayesha, id));
  await step("status: open -> in_progress", () => changeStatus(staff, id, "in_progress", null));
  await step("status: -> resolved", () => changeStatus(staff, id, "resolved", "Replaced the lamp"));

  const w = Math.max(...rows.map((r) => r.name.length));
  console.log(`${"step".padEnd(w)}  ${"time".padStart(8)}  db calls`);
  for (const r of rows) console.log(`${r.name.padEnd(w)}  ${(Math.round(r.ms) + " ms").padStart(8)}  ${r.calls}`);
  const models = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "(none)";
  console.log(`\nmodels: ${models}   AI_MODE: ${process.env.AI_MODE ?? "auto"}`);
}

main().catch((e) => {
  console.error("perf failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
