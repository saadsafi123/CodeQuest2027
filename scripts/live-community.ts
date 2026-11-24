// Purpose: `npm run live:community` runs the whole community flow (join, resolve, voting pool, dispute, reopen, early close,
// voting window + lazy auto-close, Close now, flags, trust ledger, brigading weights, confidentiality, the place picker,
// concurrency) through the REAL services against the LIVE database, so the SQL functions are exercised, not the in-memory
// test double. WIPES AND RESEEDS demo data first. Use AI_MODE=fallback for a deterministic run.
import { getSupabase } from "@/lib/db/supabase";
import { reportRepository, trustRepository, userRepository, type User } from "@/lib/db/repositories";
import { resetAllData } from "@/lib/services/adminService";
import { adminOverview, changeStatus, flagReport, getIssueDetail, listConfidentialQueue, listMyIssues } from "@/lib/services/issueService";
import { ingestReport } from "@/lib/services/reportService";
import { getMyTrust, getTrustBreakdown } from "@/lib/services/trustService";
import { createStudent } from "@/lib/services/userService";
import { castVote } from "@/lib/services/voteService";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? `error:${(e as Error).message}`;
  }
}

async function main() {
  await resetAllData({ withStory: false });
  const users = await userRepository.list();
  const by = (n: string) => users.find((u) => u.name.startsWith(n))!;
  const [ayesha, bilal, hira, usman, sana, zain] = ["Ayesha", "Bilal", "Hira", "Usman", "Sana", "Zain"].map(by) as User[];
  const cse = users.find((u) => u.role === "staff" && u.department === "CSE")!;
  const ee = users.find((u) => u.role === "staff" && u.department === "EE")!;
  const lib = users.find((u) => u.role === "staff" && u.department === "Library")!;
  const admin = users.find((u) => u.role === "admin")!;
  const db = getSupabase();
  const reportCount = async () => ((await db.from("reports").select("id", { count: "exact", head: true })).count ?? 0) as number;

  check("no Labs staff and no Labs department among the seeded users", !users.some((u) => (u.department as string | null) === "Labs") && users.filter((u) => u.role === "staff").length === 5);

  // ---- join
  const v1 = await ingestReport(ayesha, "projector kharab hai networking lab mein");
  const v2 = await ingestReport(bilal, "networking lab ka projecter nahi chal raha");
  const v3 = await ingestReport(hira, "projector not working in the networking lab");
  const id = v1.issue!.id;
  check("three students, one issue, me-too 3", v2.issue!.id === id && v3.issue!.id === id && v3.issue!.meToo === 3);

  // ---- validation trust (+3 once, via update_issue_status)
  await changeStatus(cse, id, "in_progress", null);
  const evAyesha = await trustRepository.listEvents(ayesha.id);
  check("staff taking the issue validates each counted report once (+3)", evAyesha.filter((e) => e.kind === "report_validated").length === 1 && evAyesha.find((e) => e.kind === "report_validated")!.delta === 3);
  const t0 = Date.now();
  const resolved = await changeStatus(cse, id, "resolved", "Replaced the lamp");
  check("moving on does not pay again", (await trustRepository.listEvents(ayesha.id)).filter((e) => e.kind === "report_validated").length === 1);
  const dl = new Date(resolved.voting!.deadline!).getTime() - t0;
  check("resolving sets a 48 h voting deadline and freezes a pool of 3", dl > 47.9 * 3_600_000 && dl < 48.1 * 3_600_000 && resolved.voting!.members === 3 && resolved.voting!.windowHours === 48, `${Math.round(dl / 3_600_000)} h`);
  check("dashboard says my vote is needed", (await listMyIssues(bilal))[0].needsMyVote === true);

  // ---- late joiner: can join, but is not in this round's pool
  const lateV = await ingestReport(usman, "networking lab mein projector band hai");
  check("a late joiner still joins (me-too 4)", lateV.issue!.id === id && lateV.issue!.meToo === 4);
  const lateD = await getIssueDetail(usman, id);
  check("late joiner: told their vote is not counted this round, pool still 3", lateD.voting?.lateJoiner === true && lateD.voting.canVote === false && lateD.voting.members === 3);
  check("late joiner's vote is refused", (await code(castVote(usman, id, "dispute"))) === "forbidden");
  check("late joiner is not asked to vote on the dashboard", (await listMyIssues(usman)).find((i) => i.id === id)!.needsMyVote === false);

  // ---- who may vote
  check("non-affected student is rejected", (await code(castVote(sana, id, "dispute"))) === "forbidden");
  check("staff is rejected", (await code(castVote(cse, id, "confirm"))) === "forbidden");
  check("admin is rejected", (await code(castVote(admin, id, "confirm"))) === "forbidden");

  // ---- dispute -> reopen
  const r1 = await castVote(ayesha, id, "dispute");
  check("first dispute of three does not reopen", r1.outcome === "pending" && r1.status === "resolved");
  check("one vote per round", (await code(castVote(ayesha, id, "confirm"))) === "conflict");
  const r2 = await castVote(bilal, id, "dispute");
  check("two credible disputes (weight >= 1.2) reopen the issue", r2.outcome === "reopened" && r2.status === "reopened", `dispute weight ${r2.disputeW}`);
  check("every affected student sees it reopened", (await Promise.all([ayesha, bilal, hira].map((u) => listMyIssues(u)))).every((l) => l[0].status === "reopened"));
  const evBilal = await trustRepository.listEvents(bilal.id);
  check("matching dispute votes earned +1 with a plain reason", evBilal.some((e) => e.kind === "vote_matched" && e.delta === 1 && /reopened/.test(e.reason)));
  check("the student who did not vote earned nothing", !(await trustRepository.listEvents(hira.id)).some((e) => e.kind === "vote_matched"));
  check("voting is closed while reopened", (await code(castVote(hira, id, "confirm"))) === "conflict");

  // ---- re-resolve: new round, new pool (the late joiner is in it now), fresh votes
  await changeStatus(cse, id, "in_progress", "Looking again");
  const second = await changeStatus(cse, id, "resolved", "Replaced the whole unit");
  check("re-resolved: round 2, empty tally, pool of 4 including the former late joiner", second.voting?.round === 2 && second.voting.confirmN === 0 && second.voting.disputeN === 0 && second.voting.members === 4);
  check("the former late joiner can vote now", (await getIssueDetail(usman, id)).voting?.canVote === true);
  const dup = await Promise.all([code(castVote(hira, id, "confirm")), code(castVote(hira, id, "confirm"))]);
  check("two simultaneous votes from one student: exactly one counts", dup.filter((c) => c === "ok").length === 1 && dup.filter((c) => c === "conflict").length === 1, dup.join("/"));
  let last = await castVote(ayesha, id, "confirm");
  if (last.outcome === "pending") last = await castVote(bilal, id, "confirm");
  check("confirmations reach a weighted majority of the pool: closed EARLY (before everyone voted)", last.outcome === "closed" && last.closeReason === "early_majority" && last.confirmN < 4, `confirm ${last.confirmW} of pool ${last.poolWeight}`);
  const detail = await getIssueDetail(ayesha, id);
  check("the history says it closed early", detail.status === "closed" && /Closed early/.test(detail.timeline.at(-1)!.note ?? ""));
  const rows = await db.from("resolution_votes").select("user_id,round,vote,weight").eq("issue_id", id);
  const votes = (rows.data ?? []) as { user_id: string; round: number; vote: string; weight: number }[];
  check("votes are stored per round with the weight frozen in the pool", votes.filter((x) => x.round === 1).length === 2 && votes.filter((x) => x.round === 2).length >= 2 && votes.every((x) => Number(x.weight) > 0));
  const pool = await db.from("resolution_pool").select("user_id,round").eq("issue_id", id);
  const poolRows = (pool.data ?? []) as { round: number }[];
  check("pools are stored per round (3 then 4)", poolRows.filter((p) => p.round === 1).length === 3 && poolRows.filter((p) => p.round === 2).length === 4);

  // ---- flags
  const w1 = await ingestReport(usman, "DB lab ka wifi nahi chal raha");
  const w2 = await ingestReport(sana, "wifi down in the db lab");
  const wid = w1.issue!.id;
  const sanaReport = (await db.from("reports").select("id").eq("user_id", sana.id).limit(1)).data![0].id as string;
  check("EE staff cannot flag a CSE issue's report", (await code(flagReport(ee, sanaReport, "fake", null))) === "not_found");
  const fl = await flagReport(cse, sanaReport, "fake", "was not in the lab");
  check("CSE staff flags it: me-too 2 -> 1, trust -10 with a reason", fl.meTooCount === 1 && (await trustRepository.listEvents(sana.id)).some((e) => e.delta === -10 && /fake/.test(e.reason)) && w2.issue!.id === wid);
  check("flagging twice is refused", (await code(flagReport(cse, sanaReport, "spam", null))) === "conflict");
  const dFlag = await getIssueDetail(cse, wid);
  check("staff see the flag, the student view hides it", dFlag.reports.some((r) => r.flagged === "fake") && !(await getIssueDetail(usman, wid)).reports.some((r) => r.flagged));
  await changeStatus(cse, wid, "in_progress", null);
  await changeStatus(cse, wid, "resolved", "Rebooted the switch");
  check("a flagged student is not in the pool: their vote is refused", (await code(castVote(sana, wid, "dispute"))) === "forbidden");
  check("the remaining student closes it with one confirmation (pool of 1)", (await castVote(usman, wid, "confirm")).status === "closed");

  // ---- brigading + window: fresh accounts weigh 0.5; the window ends -> lazy auto-close
  const mob = await Promise.all([createStudent("Mob 1"), createStudent("Mob 2"), createStudent("Mob 3")]);
  const e1 = await ingestReport(ayesha, "library ka AC kharab hai bohat garmi hai");
  const eid = e1.issue!.id;
  for (const m of mob) await ingestReport(m, "AC not working in the library, too hot");
  await changeStatus(lib, eid, "in_progress", null);
  await changeStatus(lib, eid, "resolved", "Serviced the unit");
  await castVote(ayesha, eid, "confirm");
  await castVote(mob[0], eid, "dispute");
  const lastE = await castVote(mob[1], eid, "dispute");
  const mobWeights = ((await db.from("resolution_votes").select("weight,user_id").eq("issue_id", eid)).data ?? []) as { weight: number; user_id: string }[];
  const mobW = mobWeights.filter((x) => mob.some((m) => m.id === x.user_id)).map((x) => Number(x.weight));
  check("brand-new accounts vote with weight 0.5", mobW.length === 2 && mobW.every((w) => w === 0.5), mobW.join(","));
  check("two new accounts (0.5 + 0.5 = 1.0 < 1.2) cannot reopen it, even at 100% of the dispute weight cast", lastE.outcome === "pending" && lastE.status === "resolved" && lastE.disputeN === 2, `dispute ${lastE.disputeW}`);
  // the window ends (we move the deadline into the past) and the issue is READ: it closes by itself
  await db.from("issues").update({ vote_deadline: new Date(Date.now() - 60_000).toISOString() }).eq("id", eid);
  const afterWindow = await getIssueDetail(mob[2], eid);
  check("window ended with no reopen: the issue closed automatically on read", afterWindow.status === "closed" && /Closed automatically/.test(afterWindow.timeline.at(-1)!.note ?? ""));
  check("the confirmer matched the outcome (+1), the disputers did not", (await trustRepository.listEvents(ayesha.id)).some((e) => e.kind === "vote_matched" && /closed/.test(e.reason)) && !(await trustRepository.listEvents(mob[0].id)).some((e) => e.kind === "vote_matched"));
  check("a vote after the window is refused", (await code(castVote(mob[2], eid, "dispute"))) === "conflict");

  // ---- Close now (owning staff / admin, with a note)
  const c1 = await ingestReport(hira, "SC lab ka AC kharab hai bohat garmi hai");
  const cid = c1.issue!.id;
  await changeStatus(cse, cid, "in_progress", null);
  await changeStatus(cse, cid, "resolved", "Replaced the unit");
  check("Close now: another department's staff cannot", (await code(changeStatus(ee, cid, "closed", "x"))) === "not_found");
  check("Close now needs a note", (await code(changeStatus(cse, cid, "closed", " "))) === "bad_request");
  const closedNow = await changeStatus(cse, cid, "closed", "Checked on site: the AC works");
  check("Close now by the owning staff with a note", closedNow.status === "closed" && closedNow.timeline.at(-1)!.note === "Checked on site: the AC works");

  // ---- the place picker (live database path)
  const before = await reportCount();
  const noPlace = await ingestReport(zain, "projector kharab hai");
  check("no place and no picker: asked BEFORE saving (0 rows written)", noPlace.status === "needs_place" && (await reportCount()) === before);
  const answered = await ingestReport(zain, "projector kharab hai", { choice: "ee-lab-1" });
  check("the tapped answer routes it to the place's department", answered.status === "routed" && answered.issue?.department === "EE" && (await reportCount()) === before + 1);
  const conflict = await ingestReport(zain, "wifi nahi chal raha DB lab mein", { hint: { department: "EE", locationId: "ee-lab-2" } });
  check("text names the DB Lab but the picker says EE Lab 2: asked, nothing saved", conflict.status === "needs_place" && conflict.placePrompt?.reason === "conflict" && (await reportCount()) === before + 1);
  const picked = await ingestReport(zain, "kuch kharab hai", { hint: { department: "IS", locationId: "is-lab-2" } });
  check("a picked place is used when the text names none", picked.status === "routed" && picked.location?.id === "is-lab-2");
  const lab = await ingestReport(zain, "projector not working in the lab");
  check("a bare 'lab' asks which department's lab (all 7 offered)", lab.status === "needs_place" && lab.placePrompt?.options.length === 7);

  // ---- confidential
  const cv = await ingestReport(zain, "Seniors are ragging first year students behind the cafeteria RAGGINGMARKER", { hint: { locationId: "library" } });
  const cq = await listConfidentialQueue(admin);
  const confId = cq[0].id;
  check("confidential: the picker is ignored; admin sees it anonymised, reporter id nowhere", cv.confidential && JSON.stringify(cq).includes("Anonymous reporter") && !JSON.stringify(cq).includes(zain.id) && cq[0].department === null);
  check("confidential: staff and students get not_found on the detail", (await code(getIssueDetail(cse, confId))) === "not_found" && (await code(getIssueDetail(sana, confId))) === "not_found");
  check("confidential: the vote endpoint says not_found for everyone, even the reporter", (await Promise.all([zain, sana, ayesha].map((u) => code(castVote(u, confId, "confirm"))))).every((c) => c === "not_found"));
  await changeStatus(admin, confId, "in_progress", null);
  await changeStatus(admin, confId, "resolved", "Handled");
  const zainEvents = ((await db.from("trust_events").select("id,related_issue_id").eq("user_id", zain.id)).data ?? []) as { related_issue_id: string | null }[];
  check("confidential: no trust event ties Zain to the confidential issue", !zainEvents.some((e) => e.related_issue_id === confId));
  check("confidential: a settle never touches it (no window, no auto-close)", (await getIssueDetail(admin, confId)).status === "resolved");

  // ---- the displayed trust score is the ledger; the ledger rebuilds exactly
  const rebuilt = await db.from("user_trust_rebuilt").select("user_id,rebuilt_score,cached_score");
  const bad = ((rebuilt.data ?? []) as { rebuilt_score: number; cached_score: number }[]).filter((r) => Math.abs(Number(r.rebuilt_score) - Number(r.cached_score)) > 0.01);
  check("every cached trust score equals 50 + sum(ledger), clamped", bad.length === 0, `${bad.length} mismatches`);
  const mine = await getMyTrust(ayesha);
  const tb = await getTrustBreakdown(ayesha, ayesha.id);
  check("top-bar score (getMyTrust) = explainer score = rebuilt ledger", mine.score === tb.currentScore && tb.consistent && tb.events.length > 0 && tb.events.every((e) => e.reason.length > 10));
  // simulate drift: corrupt the cached number; the endpoint answers from the ledger and repairs the cache
  await db.from("users").update({ trust_score: 99 }).eq("id", ayesha.id);
  const healed = await getMyTrust(ayesha);
  const after = (await db.from("users").select("trust_score").eq("id", ayesha.id).single()).data!.trust_score as number;
  check("a corrupted cached score is never shown, and is repaired", healed.score === mine.score && Number(after) === mine.score, `${healed.score} vs 99`);
  check("a student cannot read another student's ledger", (await code(getTrustBreakdown(bilal, ayesha.id))) === "not_found");

  const ov = await adminOverview(admin);
  check("admin overview: stuck-report list is empty and confidential is only counted", ov.stats.needsAttention === 0 && ov.stats.confidential === 1 && !JSON.stringify(ov).includes("RAGGINGMARKER"));
  check("no stuck reports anywhere", (await reportRepository.listNeedsAttention()).length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error("live check crashed:", e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
