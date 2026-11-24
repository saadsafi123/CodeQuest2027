// Purpose: role-aware issue reads and status updates. EVERY function takes the current user and enforces access
// on the server (rules/permissions.ts). Views never contain student identities; confidential issues are visible
// only to the admin ("Anonymous reporter") and, in a minimal form, to their own reporter.
import "server-only";
import { config, votingWindowSeconds } from "@/lib/config";
import { issueRepository, reportRepository, type Issue, type IssueBundle, type IssueStatus, type User, type VoteKind } from "@/lib/db/repositories";
import { ANONYMOUS_REPORTER } from "@/lib/rules/confidentiality";
import { getLocationById } from "@/lib/rules/location";
import { allowedStatusMoves, canChangeStatus, canFlagReports, canViewIssue, isAdmin, voteEligibility } from "@/lib/rules/permissions";
import { flagDelta, trustReasons } from "@/lib/rules/trust";
import { closeRuleText, evaluateVotes, reopenRuleText, voteRpcConfig } from "@/lib/rules/voting";
import { ServiceError } from "./errors";
import { poolFor, refreshIssuePriority } from "./priorityService";
import { toReportView, type ReportView } from "./reportService";
import { invalidateUser } from "./userService";

const PRIORITY_ORDER = { critical: 3, high: 2, medium: 1, low: 0 } as const;

export interface IssueSummary {
  id: string;
  title: string;
  location: { id: string; name: string } | null;
  department: string | null;
  priority: Issue["priority"];
  status: IssueStatus;
  meToo: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  confidential: boolean;
  /** Not confidential, but no department owns the place: waiting for the admin. */
  needsDepartment: boolean;
  /** The viewing student's relationship to the issue. */
  myRole: "reporter" | "joined" | null;
  /** Status moves the VIEWER may make (computed on the server; the client only renders buttons). */
  allowedMoves: IssueStatus[];
  /** Students: how I voted in the current resolution round. */
  myVote: VoteKind | null;
  /** Students: the issue is resolved and my confirm/dispute is still missing. */
  needsMyVote: boolean;
}

/** The "Is it really fixed?" box: live tallies of the current resolution round (no names, ever). */
export interface VotingView {
  round: number;
  /** Voting is open right now (status resolved). */
  open: boolean;
  members: number;
  confirmN: number;
  disputeN: number;
  waiting: number;
  /** Dispute weight / total weight cast, 0..1. */
  disputeShare: number;
  disputersNeeded: number;
  shareNeeded: number;
  rule: string;
  myVote: VoteKind | null;
  /** The viewer is an affected student who can vote right now. */
  canVote: boolean;
  /** When this round's voting window ends (ISO), and how long a window is, in hours (for the explanation). */
  deadline: string | null;
  windowHours: number;
  /** Confirm weight / the pool's total weight: progress toward an early close. */
  confirmShareOfPool: number;
  confirmersNeeded: number;
  closeRule: string;
  /** The viewer is affected but joined after the fix was reported, so their vote is not counted in this round. */
  lateJoiner: boolean;
}

export interface DetailReport {
  /** Present only for staff/admin who may flag it. */
  id: string | null;
  text: string;
  language: string | null;
  createdAt: string;
  flagged: "spam" | "fake" | "abuse" | null;
  canFlag: boolean;
}

export interface TimelineEntry {
  id: string;
  at: string;
  label: string;
  note: string | null;
  from: string | null;
  to: string | null;
}

export interface IssueDetail extends IssueSummary {
  whyPriority: string[];
  crowd: { distinctStudents: number; cappedAccounts: number } | null;
  routing: string | null;
  timeline: TimelineEntry[];
  reports: DetailReport[];
  voting: VotingView | null;
  resolutionRound: number;
  /** Always "Anonymous reporter" for confidential issues. */
  reporterLabel: string | null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function toSummary(issue: Issue, myRole: IssueSummary["myRole"] = null, viewer?: User | null, my?: { vote: VoteKind | null; excluded: boolean; inPool: boolean }): IssueSummary {
  const loc = issue.canonicalLocation ? getLocationById(issue.canonicalLocation) : null;
  // A student sees their own confidential report in a minimal form (no location, no department, no reason).
  const minimal = issue.isConfidential && viewer?.role === "student";
  const confidentialTitle = issue.isConfidential ? "Confidential report" : null;
  return {
    id: issue.id,
    title: minimal ? "Confidential report" : (confidentialTitle ?? cap(issue.signature)),
    location: minimal || !loc ? null : { id: loc.id, name: loc.name },
    department: minimal ? null : issue.department,
    priority: issue.priority,
    status: issue.status,
    meToo: issue.isConfidential ? 1 : issue.meTooCount,
    reason: minimal ? null : issue.oneLineReason,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    confidential: issue.isConfidential,
    needsDepartment: !issue.isConfidential && !issue.department,
    myRole,
    allowedMoves: viewer ? allowedStatusMoves(viewer, { department: issue.department, isConfidential: issue.isConfidential, status: issue.status }) : [],
    myVote: my?.vote ?? null,
    needsMyVote: !!my && !my.excluded && my.inPool && !my.vote && !!myRole && issue.status === "resolved" && !issue.isConfidential && !isOverdue(issue),
  };
}

const byImportance = (a: IssueSummary, b: IssueSummary) =>
  PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] || b.meToo - a.meToo || +new Date(a.createdAt) - +new Date(b.createdAt);

function need(user: User | null): User {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  return user;
}

/** The voting window of a resolved issue has ended. */
export function isOverdue(issue: { status: string; voteDeadline: string | null; isConfidential?: boolean }, now: number = Date.now()): boolean {
  return issue.status === "resolved" && !issue.isConfidential && !!issue.voteDeadline && new Date(issue.voteDeadline).getTime() <= now;
}

/**
 * Lazy auto-close (no background job): whenever issues are read, any resolved issue whose voting window ended with no
 * reopen is closed by the database function first. Returns true when something was closed, so the caller re-reads.
 */
export async function settleOverdue(issues: { status: string; voteDeadline: string | null; isConfidential?: boolean }[]): Promise<boolean> {
  if (!issues.some((i) => isOverdue(i))) return false;
  const n = await issueRepository.settleDue(null, voteRpcConfig());
  if (n > 0) invalidateUser(); // matching confirm votes were just paid
  return n > 0;
}

/** Student dashboard: every issue I reported or joined. */
export async function listMyIssues(user: User | null): Promise<IssueSummary[]> {
  const u = need(user);
  if (u.role !== "student") throw new ServiceError("forbidden", "Only students have a personal issue list.");
  let rows = await issueRepository.listForStudent(u.id);
  if (await settleOverdue(rows.map((r) => r.issue))) rows = await issueRepository.listForStudent(u.id);
  return rows.map((r) => toSummary(r.issue, r.role, u, { vote: r.myVote, excluded: r.excluded, inPool: r.inPool })).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** Reports of mine that still need a place (shown on the dashboard with the question). */
export async function listMyPendingReports(user: User | null): Promise<ReportView[]> {
  const u = need(user);
  if (u.role !== "student") throw new ServiceError("forbidden", "Only students have reports.");
  return (await reportRepository.listByUser(u.id)).filter((r) => r.status === "needs_clarification" && !r.isConfidential).map((r) => toReportView(r));
}

/** Staff: own department only. Admin: every non-confidential issue. */
export async function listQueue(user: User | null): Promise<IssueSummary[]> {
  const u = need(user);
  if (u.role === "staff") {
    if (!u.department) return [];
    let rows = await issueRepository.listForDepartment(u.department);
    if (await settleOverdue(rows)) rows = await issueRepository.listForDepartment(u.department);
    return rows.map((i) => toSummary(i, null, u)).sort(byImportance);
  }
  if (u.role === "admin") {
    let rows = await issueRepository.listPublic();
    if (await settleOverdue(rows)) rows = await issueRepository.listPublic();
    return rows.map((i) => toSummary(i, null, u)).sort(byImportance);
  }
  throw new ServiceError("forbidden", "Not allowed.");
}

/** Admin only. The reporter is never included or looked up. */
export async function listConfidentialQueue(user: User | null): Promise<(IssueSummary & { reporterLabel: string })[]> {
  const u = need(user);
  if (!isAdmin(u)) throw new ServiceError("forbidden", "Only the admin can see confidential reports.");
  return (await issueRepository.listConfidential())
    .map((i) => ({ ...toSummary(i, null, u), title: `Confidential report (${i.category.replace("_", " ")})`, reporterLabel: ANONYMOUS_REPORTER }))
    .sort(byImportance);
}

export interface AdminOverview {
  issues: IssueSummary[];
  stats: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    reopened: number;
    critical: number;
    needsDepartment: number;
    confidential: number;
    awaitingPlace: number;
    needsAttention: number;
  };
  awaitingPlace: ReportView[];
  needsAttention: AttentionItem[];
}

/** A saved report that never got an issue. Confidential ones carry no text and no author, ever. */
export interface AttentionItem {
  reportId: string;
  confidential: boolean;
  text: string | null;
  location: string | null;
  reason: string;
  createdAt: string;
}

export async function adminOverview(user: User | null): Promise<AdminOverview> {
  const u = need(user);
  if (!isAdmin(u)) throw new ServiceError("forbidden", "Only the admin can see the overview.");
  const [issues, conf, awaiting, stuck] = await Promise.all([
    listQueue(u),
    issueRepository.listConfidential(),
    reportRepository.listAdminClarifications(),
    reportRepository.listNeedsAttention(),
  ]);
  const count = (s: IssueStatus) => issues.filter((i) => i.status === s).length;
  return {
    issues,
    stats: {
      total: issues.length,
      open: count("open"),
      inProgress: count("in_progress"),
      resolved: count("resolved"),
      reopened: count("reopened"),
      critical: issues.filter((i) => i.priority === "critical" && i.status !== "closed" && i.status !== "resolved").length,
      needsDepartment: issues.filter((i) => i.needsDepartment).length,
      confidential: conf.length,
      awaitingPlace: awaiting.length,
      needsAttention: stuck.length,
    },
    awaitingPlace: awaiting.map((r) => toReportView(r)),
    needsAttention: stuck.map<AttentionItem>((r) => ({
      reportId: r.id,
      confidential: r.isConfidential,
      text: r.isConfidential ? null : r.rawText.slice(0, 200),
      location: r.isConfidential ? null : ((r.canonicalLocation && getLocationById(r.canonicalLocation)?.name) || null),
      reason: r.attention === "issue_creation_failed" ? "Saved, but creating the issue failed." : "Saved, but never reached an issue.",
      createdAt: r.createdAt,
    })),
  };
}

function actorLabel(a: { role: string; department: string | null } | null): string {
  if (!a) return "System";
  return a.role === "admin" ? "Admin" : `${a.department ?? "Department"} staff`;
}

function votingView(u: User, b: IssueBundle): VotingView | null {
  if (b.issue.isConfidential || !b.votes || b.issue.resolutionRound === 0) return null;
  const v = b.votes;
  const members = b.pool.members; // this round's pool: late joiners are not in it
  const ev = evaluateVotes(members, { confirmN: v.confirmN, disputeN: v.disputeN, confirmW: v.confirmW, disputeW: v.disputeW }, b.pool.weight);
  const open = b.issue.status === "resolved" && !isOverdue(b.issue);
  const eligible = voteEligibility(u, { status: b.issue.status, isConfidential: false }, b.myRole && b.pool.mine ? { excluded: b.myExcluded } : null);
  return {
    round: v.round,
    open,
    members,
    confirmN: v.confirmN,
    disputeN: v.disputeN,
    waiting: ev.waiting,
    disputeShare: ev.disputeShare,
    disputersNeeded: ev.disputersNeeded,
    shareNeeded: config.voting.disputeWeightShareToReopen,
    rule: reopenRuleText(members),
    myVote: v.myVote,
    canVote: open && eligible.ok && !v.myVote,
    deadline: b.issue.voteDeadline,
    windowHours: Math.round((votingWindowSeconds() / 3600) * 100) / 100,
    confirmShareOfPool: ev.confirmShareOfPool,
    confirmersNeeded: ev.confirmersNeeded,
    closeRule: closeRuleText(members),
    lateJoiner: u.role === "student" && b.myRole !== null && !b.pool.mine && b.issue.status === "resolved",
  };
}

export async function getIssueDetail(user: User | null, issueId: string): Promise<IssueDetail> {
  const u = need(user);
  // ONE database call for the whole page (issue, my membership, timeline, reports, vote tally).
  let b = await issueRepository.bundle(issueId, u.id, false);
  // lazy auto-close: the voting window may have ended since the last read
  if (b && (await settleOverdue([b.issue]))) b = await issueRepository.bundle(issueId, u.id, false);
  // "not found" for anything the viewer may not see: no hint that it exists
  if (!b || !canViewIssue(u, { department: b.issue.department, isConfidential: b.issue.isConfidential, status: b.issue.status }, b.myRole !== null)) {
    throw new ServiceError("not_found", "Issue not found.");
  }
  const issue = b.issue;
  // Confidential report text: only the admin and the reporter's own minimal view (the data layer returns it only when asked).
  if (issue.isConfidential && (isAdmin(u) || b.myRole !== null)) b = (await issueRepository.bundle(issueId, u.id, true)) ?? b;
  const summary = toSummary(issue, b.myRole, u, { vote: b.votes?.myVote ?? null, excluded: b.myExcluded, inPool: b.pool.mine });
  const minimal = issue.isConfidential && u.role === "student";
  const access = { department: issue.department, isConfidential: issue.isConfidential, status: issue.status };
  const flaggable = canFlagReports(u, access);
  const pb = issue.priorityBreakdown as { explanation?: string[]; crowd?: { distinctStudents: number; cappedAccounts: number }; routing?: { reason: string } };
  return {
    ...summary,
    whyPriority: minimal ? [] : (pb.explanation ?? []),
    crowd: minimal || !pb.crowd ? null : { distinctStudents: pb.crowd.distinctStudents, cappedAccounts: pb.crowd.cappedAccounts },
    routing: minimal ? null : (pb.routing?.reason ?? null),
    timeline: b.updates.map((x) => ({
      id: x.id,
      at: x.createdAt,
      label: x.actor ? actorLabel(x.actor) : "System",
      note: minimal && !x.actor ? null : x.note,
      from: x.fromStatus,
      to: x.toStatus,
    })),
    reports: b.reports
      // students never see reports that staff flagged as spam/fake
      .filter((r) => u.role !== "student" || !r.flagged)
      .map<DetailReport>((r) => ({
        id: flaggable && r.id ? r.id : null,
        text: r.text,
        language: r.language,
        createdAt: r.createdAt,
        flagged: u.role === "student" ? null : r.flagged,
        canFlag: flaggable && !!r.id && !r.flagged,
      })),
    voting: votingView(u, b),
    resolutionRound: issue.resolutionRound,
    reporterLabel: issue.isConfidential ? ANONYMOUS_REPORTER : null,
  };
}

/** Staff of the owning department or the admin move an issue along. */
export async function changeStatus(user: User | null, issueId: string, to: IssueStatus, note: string | null): Promise<IssueDetail> {
  const u = need(user);
  const issue = await issueRepository.getById(issueId);
  if (!issue || !canViewIssue(u, { department: issue.department, isConfidential: issue.isConfidential, status: issue.status }, false)) {
    throw new ServiceError("not_found", "Issue not found.");
  }
  if (!canChangeStatus(u, { department: issue.department, isConfidential: issue.isConfidential, status: issue.status }, to)) {
    throw new ServiceError("bad_request", `An issue that is ${issue.status.replace("_", " ")} cannot be moved to ${to.replace("_", " ")}.`);
  }
  const cleanNote = note?.trim().slice(0, 500) || null;
  if (to === "resolved" && !cleanNote) throw new ServiceError("bad_request", "Please add a short note on what was done.");
  if (to === "closed" && !cleanNote) throw new ServiceError("bad_request", "Please add a short note saying why you are closing it now.");
  // The first time staff take up an open issue, every counted reporter's report is "validated" (trust +3, once).
  const firstTouch = issue.status === "open" && (to === "in_progress" || to === "resolved") && !issue.isConfidential;
  try {
    await issueRepository.changeStatus(
      issue.id,
      u.id,
      issue.status,
      to,
      cleanNote,
      {
        validate: firstTouch ? { delta: config.trust.deltas.reportConfirmedOrValidated, reason: trustReasons.reportValidated } : undefined,
        // resolving opens a voting round: freeze who may vote (everyone affected right now) and their weights, and set the window
        ...(to === "resolved" && !issue.isConfidential ? { pool: await poolFor(issue.id), windowSeconds: votingWindowSeconds() } : {}),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "stale_status") throw new ServiceError("conflict", "Someone else just updated this issue. Please refresh.");
    throw e;
  }
  if (firstTouch) {
    invalidateUser(); // trust scores just changed: do not serve stale ones
    await refreshIssuePriority(issue.id).catch(() => {}); // weights may have changed with the new ledger rows
  }
  return getIssueDetail(u, issue.id);
}

/** Staff of the owning department / admin flag a report as spam, fake or abuse: the author's trust drops, the report stops counting. */
export async function flagReport(user: User | null, reportId: string, kind: "spam" | "fake" | "abuse", note: string | null): Promise<{ meTooCount: number; closed: boolean }> {
  const u = need(user);
  const report = await reportRepository.getById(reportId);
  const issue = report?.issueId ? await issueRepository.getById(report.issueId) : null;
  // same "not found" for missing / confidential / not yours: nothing is revealed
  if (!report || !issue || report.isConfidential || !canFlagReports(u, { department: issue.department, isConfidential: issue.isConfidential, status: issue.status })) {
    throw new ServiceError("not_found", "Report not found.");
  }
  try {
    const r = await issueRepository.flagReport(report.id, u.id, kind, note?.trim().slice(0, 300) || null, flagDelta(kind), trustReasons.flagged(kind));
    invalidateUser();
    if (!r.closed) await refreshIssuePriority(issue.id).catch(() => {});
    return { meTooCount: r.meTooCount, closed: r.closed };
  } catch (e) {
    if (e instanceof Error && e.message === "already_flagged") throw new ServiceError("conflict", "This report was already flagged.");
    if (e instanceof Error && e.message === "report_not_found") throw new ServiceError("not_found", "Report not found.");
    throw e;
  }
}
