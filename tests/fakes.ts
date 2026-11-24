// In-memory stand-ins for the repositories, with the SAME semantics as the SQL functions
// (attach_report_new_issue / attach_report_to_issue / update_issue_status / cast_resolution_vote / flag_report /
// apply_trust_event). Lets us test the whole pipeline (services + rules) without a database. The vote decision
// calls the same pure rule (rules/voting.ts) the SQL mirrors; live-DB behaviour is verified separately against Supabase.
import type {
  BundleReport, Issue, IssueBundle, IssueUpdateRow, NewIssueInput, NewReport, Report, StudentIssueRow, TrustEventRow, TrustProfileRow, VoteKind, VoteResult,
} from "@/lib/db/repositories/types";
import { evaluateVotes } from "@/lib/rules/voting";

interface Member { issueId: string; userId: string; reportId: string | null; role: "reporter" | "joined"; excluded: boolean }
interface Upd extends IssueUpdateRow { issueId: string; actorId: string | null }
interface Vote { issueId: string; userId: string; round: number; vote: VoteKind; weight: number }
interface TEvent extends TrustEventRow { userId: string; issueId: string | null; reportId: string | null; round: number | null }
type FakeUser = { name: string; role: "student" | "staff" | "admin"; department: string | null };

export const db = {
  reports: new Map<string, Report & { flaggedKind?: "spam" | "fake" | "abuse" | null }>(),
  issues: new Map<string, Issue>(),
  members: [] as Member[],
  updates: [] as Upd[],
  votes: [] as Vote[],
  /** voting pools frozen when an issue is resolved: "issueId:round" -> members and weights */
  pools: new Map<string, { userId: string; weight: number }[]>(),
  /** the part of a seeded trust score that has no ledger rows in the fake (score = 50 + seedSum + sum(events)) */
  seedSum: new Map<string, number>(),
  trustEvents: [] as TEvent[],
  profiles: new Map<string, TrustProfileRow>(),
  users: new Map<string, FakeUser>(),
  /** Failure injection: make the next N calls of a repository method throw (to test half-finished reports). */
  failNext: { attachNew: 0, attachJoin: 0, attachNewAfterWrite: 0 },
};

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const clone = <T,>(x: T): T => structuredClone(x);
const DAY = 86_400_000;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function resetFakes() {
  db.reports.clear(); db.issues.clear(); db.members.length = 0; db.updates.length = 0; db.votes.length = 0; db.trustEvents.length = 0; db.pools.clear(); db.seedSum.clear();
  db.profiles.clear(); db.users.clear(); db.failNext.attachNew = 0; db.failNext.attachJoin = 0; db.failNext.attachNewAfterWrite = 0;
}

/** Register a student with a trust profile. kind: veteran (trust 88, 30 days, 18 events) | normal (50) | newbie (50, created now, 0 events). */
export function addStudent(name: string, kind: "veteran" | "normal" | "newbie" | "lowtrust" = "normal", trust?: number) {
  const id = uid();
  const p = {
    veteran: { trustScore: 88, age: 30, events: 18 },
    normal: { trustScore: 50, age: 30, events: 6 },
    lowtrust: { trustScore: 30, age: 30, events: 7 },
    newbie: { trustScore: 50, age: 0, events: 0 },
  }[kind];
  const createdAt = new Date(Date.now() - p.age * DAY).toISOString();
  db.profiles.set(id, { userId: id, trustScore: trust ?? p.trustScore, createdAt, ledgerEvents: p.events });
  db.seedSum.set(id, (trust ?? p.trustScore) - 50);
  db.users.set(id, { name, role: "student", department: null });
  return { id, name, role: "student" as const, department: null, trustScore: trust ?? p.trustScore, createdAt };
}
export function addStaff(dept: string) {
  const id = uid();
  db.users.set(id, { name: `${dept} staff`, role: "staff", department: dept });
  return { id, name: `${dept} staff`, role: "staff" as const, department: dept as never, trustScore: 50, createdAt: "" };
}
export function addAdmin() {
  const id = uid();
  db.users.set(id, { name: "Admin", role: "admin", department: null });
  return { id, name: "Admin", role: "admin" as const, department: null, trustScore: 50, createdAt: "" };
}

/** apply_trust_event: ledger row + cached score, once per (user, kind, issue, report, round). Returns the new score or null if duplicate. */
function applyTrust(userId: string, delta: number, reason: string, kind: string, o: { issueId?: string | null; reportId?: string | null; round?: number | null } = {}): number | null {
  const dup = db.trustEvents.some((e) => e.userId === userId && e.kind === kind && e.issueId === (o.issueId ?? null) && e.reportId === (o.reportId ?? null) && (e.round ?? 0) === (o.round ?? 0));
  if (dup) return null;
  db.trustEvents.push({ id: uid(), userId, delta, reason, kind, createdAt: new Date().toISOString(), issueId: o.issueId ?? null, reportId: o.reportId ?? null, round: o.round ?? null });
  const p = db.profiles.get(userId);
  if (!p) return null;
  // like the SQL function: the score is always clamp(50 + everything in the ledger), never an incremental guess
  p.trustScore = clamp(50 + (db.seedSum.get(userId) ?? 0) + db.trustEvents.filter((e) => e.userId === userId).reduce((a, e) => a + e.delta, 0));
  p.ledgerEvents += 1;
  return p.trustScore;
}

const counted = (issueId: string) => db.members.filter((m) => m.issueId === issueId && !m.excluded);
/** the round's frozen pool, minus members flagged since */
const poolOf = (issueId: string, round: number) => (db.pools.get(`${issueId}:${round}`) ?? []).filter((p) => counted(issueId).some((m) => m.userId === p.userId));

export const reportRepository = {
  async insert(r: NewReport): Promise<Report> {
    const row: Report = { id: uid(), issueId: null, attention: null, createdAt: new Date().toISOString(), ...r };
    db.reports.set(row.id, row);
    return clone(row);
  },
  async getById(id: string) { return db.reports.has(id) ? clone(db.reports.get(id)!) : null; },
  async listByUser(userId: string) { return [...db.reports.values()].filter((r) => r.userId === userId).map(clone); },
  async listAdminClarifications() {
    return [...db.reports.values()].filter((r) => r.status === "needs_clarification" && !r.isConfidential && (r.flags.clarification as { adminOnly?: boolean })?.adminOnly).map(clone);
  },
  async updateClarification(id: string, expected: number, patch: { status: Report["status"]; canonicalLocation: string | null; flags: Record<string, unknown> }) {
    const r = db.reports.get(id);
    if (!r || r.status !== "needs_clarification" || (r.flags.clarification as { attempts: number }).attempts !== expected) return null;
    Object.assign(r, { status: patch.status, canonicalLocation: patch.canonicalLocation, flags: patch.flags });
    return clone(r);
  },
  async markAttention(id: string, reason: string | null) { const r = db.reports.get(id); if (r) r.attention = reason; },
  async listNeedsAttention() {
    return [...db.reports.values()].filter((r) => !r.issueId && (r.attention !== null || (r.status === "received" && (r.isConfidential || r.canonicalLocation)))).map(clone);
  },
};

export const issueRepository = {
  async attachNew(reportId: string, i: NewIssueInput) {
    if (db.failNext.attachNew > 0) { db.failNext.attachNew--; throw new Error("simulated database failure"); }
    const r = db.reports.get(reportId);
    if (!r) throw new Error("report_not_found");
    if (r.issueId) throw new Error("report_already_attached");
    const now = new Date().toISOString();
    const issue: Issue = {
      id: uid(), canonicalLocation: i.canonicalLocation, category: i.category, signature: i.signature, department: i.department,
      priority: i.priority, priorityScore: i.priorityScore, priorityBreakdown: clone(i.priorityBreakdown), status: "open",
      isConfidential: i.isConfidential, meTooCount: 1, oneLineReason: i.oneLineReason, resolutionRound: 0, createdAt: now, updatedAt: now, resolvedAt: null, voteDeadline: null,
    };
    db.issues.set(issue.id, issue);
    db.members.push({ issueId: issue.id, userId: r.userId, reportId: r.id, role: "reporter", excluded: false });
    r.issueId = issue.id; r.status = "routed"; r.canonicalLocation = i.canonicalLocation ?? r.canonicalLocation;
    db.updates.push({ id: uid(), issueId: issue.id, actorId: null, fromStatus: null, toStatus: "open", note: "Issue created from a report.", createdAt: now, actor: null });
    // the write committed but the answer was lost (network): the caller sees a failure although the issue exists
    if (db.failNext.attachNewAfterWrite > 0) { db.failNext.attachNewAfterWrite--; throw new Error("simulated lost response"); }
    return issue.id;
  },
  async attachJoin(reportId: string, issueId: string, p: { priority: Issue["priority"]; score: number; breakdown: Record<string, unknown> }) {
    if (db.failNext.attachJoin > 0) { db.failNext.attachJoin--; throw new Error("simulated database failure"); }
    const r = db.reports.get(reportId); const issue = db.issues.get(issueId);
    if (!r) throw new Error("report_not_found");
    if (!issue) throw new Error("issue_not_found");
    if (r.issueId) throw new Error("report_already_attached");
    if (issue.isConfidential) throw new Error("confidential_issue_cannot_be_joined");
    if (issue.status === "closed") throw new Error("issue_closed");
    const exists = db.members.some((m) => m.issueId === issueId && m.userId === r.userId);
    if (!exists) db.members.push({ issueId, userId: r.userId, reportId, role: "joined", excluded: false });
    issue.meTooCount = counted(issueId).length;
    Object.assign(issue, { priority: p.priority, priorityScore: p.score, priorityBreakdown: clone(p.breakdown), updatedAt: new Date().toISOString() });
    r.issueId = issueId; r.status = "grouped"; r.canonicalLocation = issue.canonicalLocation;
    if (!exists) db.updates.push({ id: uid(), issueId, actorId: null, fromStatus: issue.status, toStatus: issue.status, note: `Another student reported the same problem (${issue.meTooCount} affected).`, createdAt: issue.updatedAt, actor: null });
    return { joined: !exists, meTooCount: issue.meTooCount };
  },
  async getById(id: string) { return db.issues.has(id) ? clone(db.issues.get(id)!) : null; },
  async listGroupingCandidates(loc: string) {
    return [...db.issues.values()].filter((i) => i.canonicalLocation === loc && !i.isConfidential && i.status !== "closed").map(clone);
  },
  async listForStudent(userId: string): Promise<StudentIssueRow[]> {
    return db.members.filter((m) => m.userId === userId).map((m) => {
      const issue = db.issues.get(m.issueId)!;
      const v = db.votes.find((x) => x.issueId === m.issueId && x.userId === userId && x.round === issue.resolutionRound);
      const inPool = (db.pools.get(`${m.issueId}:${issue.resolutionRound}`) ?? []).some((x) => x.userId === userId);
      return { issue: clone(issue), role: m.role, excluded: m.excluded, inPool, myVote: v?.vote ?? null };
    });
  },
  async listForDepartment(dept: string) { return [...db.issues.values()].filter((i) => i.department === dept && !i.isConfidential).map(clone); },
  async listPublic() { return [...db.issues.values()].filter((i) => !i.isConfidential).map(clone); },
  async listConfidential() { return [...db.issues.values()].filter((i) => i.isConfidential).map(clone); },
  async memberRole(issueId: string, userId: string) { return db.members.find((m) => m.issueId === issueId && m.userId === userId)?.role ?? null; },
  async memberUserIds(issueId: string) { return counted(issueId).map((m) => m.userId); },
  async memberTrustProfiles(issueId: string): Promise<TrustProfileRow[]> {
    return counted(issueId).flatMap((m) => (db.profiles.has(m.userId) ? [clone(db.profiles.get(m.userId)!)] : []));
  },
  async listUpdates(issueId: string) {
    return db.updates.filter((u) => u.issueId === issueId).map((u) => {
      const au = u.actorId ? db.users.get(u.actorId) : null;
      return { ...clone(u), actor: au && au.role !== "student" ? { role: au.role, department: au.department as never } : null };
    });
  },
  async listReportTexts(issueId: string, opts?: { includeConfidential?: boolean }) {
    const issue = db.issues.get(issueId);
    if (!issue || (issue.isConfidential && !opts?.includeConfidential)) return [];
    return [...db.reports.values()].filter((r) => r.issueId === issueId).map((r) => ({ text: r.rawText, language: r.language, createdAt: r.createdAt }));
  },
  /** issue_bundle: everything the issue page needs. Confidential reports only when asked; they never carry ids. */
  async bundle(issueId: string, userId: string, includeReports: boolean): Promise<IssueBundle | null> {
    const issue = db.issues.get(issueId);
    if (!issue) return null;
    const me = db.members.find((m) => m.issueId === issueId && m.userId === userId);
    const reports: BundleReport[] = issue.isConfidential && !includeReports ? [] : [...db.reports.values()].filter((r) => r.issueId === issueId)
      .map((r) => ({ id: r.id, text: r.rawText, language: r.language, createdAt: r.createdAt, flagged: r.flaggedKind ?? null }));
    const pool = poolOf(issueId, issue.resolutionRound);
    const vs = db.votes.filter((v) => v.issueId === issueId && v.round === issue.resolutionRound && pool.some((m) => m.userId === v.userId));
    return {
      issue: clone(issue),
      myRole: me?.role ?? null,
      myExcluded: me?.excluded ?? false,
      members: counted(issueId).length,
      pool: issue.isConfidential ? { members: 0, weight: 0, mine: false } : { members: pool.length, weight: pool.reduce((a, m) => a + m.weight, 0), mine: pool.some((m) => m.userId === userId) },
      updates: await issueRepository.listUpdates(issueId),
      reports: issue.isConfidential ? reports.map((r) => ({ ...r, id: "" })) : reports,
      votes: issue.isConfidential ? null : {
        round: issue.resolutionRound,
        confirmN: vs.filter((v) => v.vote === "confirm").length,
        disputeN: vs.filter((v) => v.vote === "dispute").length,
        confirmW: vs.filter((v) => v.vote === "confirm").reduce((a, v) => a + v.weight, 0),
        disputeW: vs.filter((v) => v.vote === "dispute").reduce((a, v) => a + v.weight, 0),
        myVote: vs.find((v) => v.userId === userId)?.vote ?? null,
      },
    };
  },
  async updatePriority(issueId: string, p: { priority: Issue["priority"]; score: number; breakdown: Record<string, unknown> }) {
    const i = db.issues.get(issueId)!;
    Object.assign(i, { priority: p.priority, priorityScore: p.score, priorityBreakdown: clone(p.breakdown) });
  },
  async changeStatus(issueId: string, actorId: string, from: Issue["status"], to: Issue["status"], note: string | null, opts?: { validate?: { delta: number; reason: string }; pool?: { userId: string; weight: number }[]; windowSeconds?: number }) {
    const i = db.issues.get(issueId);
    if (!i) throw new Error("issue_not_found");
    if (i.status !== from) throw new Error("stale_status");
    i.status = to; i.updatedAt = new Date().toISOString();
    if (to === "resolved") {
      i.resolvedAt = i.updatedAt; i.resolutionRound += 1;
      i.voteDeadline = new Date(Date.now() + Math.max(opts?.windowSeconds ?? 0, 0) * 1000).toISOString();
      if (!i.isConfidential) db.pools.set(`${issueId}:${i.resolutionRound}`, (opts?.pool ?? []).filter((p) => counted(issueId).some((m) => m.userId === p.userId)).map((p) => ({ ...p })));
    }
    db.updates.push({ id: uid(), issueId, actorId, fromStatus: from, toStatus: to, note, createdAt: i.updatedAt, actor: null });
    const validate = opts?.validate;
    if (validate && validate.delta !== 0 && from === "open" && (to === "in_progress" || to === "resolved") && !i.isConfidential) {
      for (const m of counted(issueId)) applyTrust(m.userId, validate.delta, validate.reason, "report_validated", { issueId, reportId: m.reportId, round: 0 });
    }
    return { status: i.status, resolutionRound: i.resolutionRound, voteDeadline: i.voteDeadline };
  },
  /** settle_resolution: close resolved issues whose window ended without a reopen */
  async settleDue(issueId: string | null, cfg: Record<string, unknown>) {
    let n = 0;
    for (const i of db.issues.values()) {
      if (i.status !== "resolved" || i.isConfidential || !i.voteDeadline || new Date(i.voteDeadline).getTime() > Date.now()) continue;
      if (issueId && i.id !== issueId) continue;
      i.status = "closed"; i.updatedAt = new Date().toISOString();
      db.updates.push({ id: uid(), issueId: i.id, actorId: null, fromStatus: "resolved", toStatus: "closed", note: "Closed automatically: the voting window ended and the fix was not disputed enough to reopen.", createdAt: i.updatedAt, actor: null });
      for (const v of db.votes.filter((x) => x.issueId === i.id && x.round === i.resolutionRound && x.vote === "confirm")) applyTrust(v.userId, Number(cfg.match_delta ?? 1), String(cfg.match_reason_confirm), "vote_matched", { issueId: i.id, round: i.resolutionRound });
      n++;
    }
    return n;
  },
  async flagReport(reportId: string, actorId: string, kind: "spam" | "fake" | "abuse", _note: string | null, delta: number, reason: string) {
    const r = db.reports.get(reportId);
    if (!r || r.isConfidential) throw new Error("report_not_found");
    if (r.flaggedKind) throw new Error("already_flagged");
    r.flaggedKind = kind;
    applyTrust(r.userId, delta, reason, `report_flagged_${kind}`, { issueId: r.issueId, reportId: r.id });
    let count = 0; let closed = false;
    if (r.issueId) {
      const issue = db.issues.get(r.issueId)!;
      const others = [...db.reports.values()].some((x) => x.issueId === r.issueId && x.userId === r.userId && !x.flaggedKind);
      if (!others) for (const m of db.members) if (m.issueId === r.issueId && m.userId === r.userId) m.excluded = true;
      count = counted(r.issueId).length;
      issue.meTooCount = count;
      db.updates.push({ id: uid(), issueId: r.issueId, actorId, fromStatus: issue.status, toStatus: issue.status, note: `A report was flagged as ${kind} and no longer counts (${count} affected).`, createdAt: new Date().toISOString(), actor: null });
      if (count === 0 && issue.status !== "closed") {
        db.updates.push({ id: uid(), issueId: r.issueId, actorId, fromStatus: issue.status, toStatus: "closed", note: "Closed: every report on this issue was flagged.", createdAt: new Date().toISOString(), actor: null });
        issue.status = "closed"; closed = true;
      }
    }
    return { issueId: r.issueId, meTooCount: count, closed };
  },
};

export const voteRepository = {
  /** cast_resolution_vote */
  async cast(issueId: string, userId: string, vote: VoteKind, cfg: Record<string, unknown>): Promise<VoteResult> {
    const issue = db.issues.get(issueId);
    if (!issue || issue.isConfidential) throw new Error("issue_not_found");
    if (!counted(issueId).some((m) => m.userId === userId)) throw new Error("not_affected");
    if (issue.status !== "resolved") throw new Error("voting_closed");
    if (issue.voteDeadline && Date.now() >= new Date(issue.voteDeadline).getTime()) throw new Error("window_ended");
    const mine = (db.pools.get(`${issueId}:${issue.resolutionRound}`) ?? []).find((p) => p.userId === userId);
    if (!mine) throw new Error("joined_late");
    if (db.votes.some((v) => v.issueId === issueId && v.userId === userId && v.round === issue.resolutionRound)) throw new Error("already_voted");
    db.votes.push({ issueId, userId, round: issue.resolutionRound, vote, weight: mine.weight });
    const pool = poolOf(issueId, issue.resolutionRound);
    const vs = db.votes.filter((v) => v.issueId === issueId && v.round === issue.resolutionRound && pool.some((m) => m.userId === v.userId));
    const tally = {
      confirmN: vs.filter((v) => v.vote === "confirm").length, disputeN: vs.filter((v) => v.vote === "dispute").length,
      confirmW: vs.filter((v) => v.vote === "confirm").reduce((a, v) => a + v.weight, 0), disputeW: vs.filter((v) => v.vote === "dispute").reduce((a, v) => a + v.weight, 0),
    };
    const poolWeight = pool.reduce((a, m) => a + m.weight, 0);
    const ev = evaluateVotes(pool.length, tally, poolWeight);
    const delta = Number(cfg.match_delta ?? 1);
    if (ev.outcome === "reopened") {
      issue.status = "reopened"; issue.updatedAt = new Date().toISOString();
      db.updates.push({ id: uid(), issueId, actorId: null, fromStatus: "resolved", toStatus: "reopened", note: `Reopened: ${tally.disputeN} of ${pool.length} affected students disputed the fix.`, createdAt: issue.updatedAt, actor: null });
      for (const v of vs.filter((x) => x.vote === "dispute")) applyTrust(v.userId, delta, String(cfg.match_reason_dispute), "vote_matched", { issueId, round: issue.resolutionRound });
    } else if (ev.outcome === "closed") {
      issue.status = "closed"; issue.updatedAt = new Date().toISOString();
      db.updates.push({ id: uid(), issueId, actorId: null, fromStatus: "resolved", toStatus: "closed", note: ev.closeReason === "early_majority" ? "Closed early: enough affected students confirmed the fix (a weighted majority)." : "Closed: every affected student voted and the fix was not disputed enough to reopen.", createdAt: issue.updatedAt, actor: null });
      for (const v of vs.filter((x) => x.vote === "confirm")) applyTrust(v.userId, delta, String(cfg.match_reason_confirm), "vote_matched", { issueId, round: issue.resolutionRound });
    }
    return { outcome: ev.outcome, status: issue.status, ...tally, members: pool.length, poolWeight, round: issue.resolutionRound, closeReason: ev.closeReason ?? null };
  },
};

export const trustRepository = {
  async listEvents(userId: string): Promise<TrustEventRow[]> {
    return db.trustEvents.filter((e) => e.userId === userId && !(e.issueId && db.issues.get(e.issueId)?.isConfidential))
      .map((e) => ({ id: e.id, delta: e.delta, reason: e.reason, kind: e.kind, createdAt: e.createdAt }));
  },
};

export const userRepository = {
  /** the ledger-derived score: clamp(50 + everything in the ledger) */
  async ledgerScore(id: string) {
    if (!db.profiles.has(id)) return null;
    return clamp(50 + (db.seedSum.get(id) ?? 0) + db.trustEvents.filter((e) => e.userId === id).reduce((s, e) => s + e.delta, 0));
  },
  async trustProfiles(ids: string[]) { return ids.flatMap((id) => (db.profiles.has(id) ? [clone(db.profiles.get(id)!)] : [])); },
  async list() { return [...db.users.entries()].map(([id, u]) => ({ id, name: u.name, role: u.role, department: u.department, trustScore: db.profiles.get(id)?.trustScore ?? 50, createdAt: db.profiles.get(id)?.createdAt ?? "" })); },
  async getById(id: string) {
    const u = db.users.get(id);
    return u ? { id, name: u.name, role: u.role, department: u.department as never, trustScore: db.profiles.get(id)?.trustScore ?? 50, createdAt: db.profiles.get(id)?.createdAt ?? new Date().toISOString() } : null;
  },
  async createStudent() { throw new Error("not used"); },
  async seedDemoUsers() { return 0; },
};

export const repositoriesModule = { reportRepository, issueRepository, userRepository, voteRepository, trustRepository, systemRepository: {} };
