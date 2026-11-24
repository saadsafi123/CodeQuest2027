// Purpose: role-based access decisions (pure). Roles: student / department staff (own dept only) / admin.
// Every permission check lives here, never inline in routes or components. Services call these on the SERVER.
import type { Report, User } from "@/lib/db/repositories/types";

export type IssueStatus = "open" | "in_progress" | "resolved" | "reopened" | "closed";

export interface IssueAccessInfo {
  department: string | null;
  isConfidential: boolean;
  status: IssueStatus;
}

/** Only students file reports (judges create a student account to test). */
export function canSubmitReport(user: User | null): boolean {
  return user?.role === "student";
}

/** Only the student who wrote the report may answer its clarification question. */
export function canAnswerClarification(user: User | null, report: Report): boolean {
  return user?.role === "student" && report.userId === user.id;
}

/**
 * Can this user open this issue?
 *  - student: only issues they reported/joined (a confidential one is then shown in a minimal form)
 *  - staff: only their own department's NON-confidential issues
 *  - admin: everything (confidential ones anonymized)
 */
export function canViewIssue(user: User | null, issue: IssueAccessInfo, isMember: boolean): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "student") return isMember;
  if (user.role === "staff") return !issue.isConfidential && !!user.department && issue.department === user.department;
  return false;
}

/** Allowed status moves for staff/admin. Votes (Phase 5) drive resolved -> closed/reopened. */
const STAFF_MOVES: Record<IssueStatus, IssueStatus[]> = {
  open: ["in_progress", "resolved"],
  in_progress: ["resolved"],
  reopened: ["in_progress", "resolved"],
  // "Close now" (with a note): the owning department's staff, or the admin, may end the voting early
  resolved: ["closed"],
  closed: [],
};
const ADMIN_EXTRA: Record<IssueStatus, IssueStatus[]> = {
  open: ["closed"],
  in_progress: ["closed"],
  reopened: ["closed"],
  resolved: [],
  closed: [],
};

export function allowedStatusMoves(user: User | null, issue: IssueAccessInfo): IssueStatus[] {
  if (!user) return [];
  if (user.role === "admin") return [...new Set([...STAFF_MOVES[issue.status], ...ADMIN_EXTRA[issue.status]])];
  if (user.role === "staff" && canViewIssue(user, issue, false)) return STAFF_MOVES[issue.status];
  return [];
}

export function canChangeStatus(user: User | null, issue: IssueAccessInfo, to: IssueStatus): boolean {
  return allowedStatusMoves(user, issue).includes(to);
}

export const isAdmin = (u: User | null) => u?.role === "admin";

export type VoteDenied = "not_affected" | "voting_closed" | "not_found";

/** Only students who are affected (reporter or joiner, not flagged) may vote, only while the issue is resolved, never on a confidential issue. */
export function voteEligibility(
  user: User | null,
  issue: { status: IssueStatus; isConfidential: boolean },
  member: { excluded: boolean } | null,
): { ok: true } | { ok: false; reason: VoteDenied } {
  if (!user || user.role !== "student" || issue.isConfidential) return { ok: false, reason: issue.isConfidential ? "not_found" : "not_affected" };
  if (!member || member.excluded) return { ok: false, reason: "not_affected" };
  if (issue.status !== "resolved") return { ok: false, reason: "voting_closed" };
  return { ok: true };
}

/** Flag a report as spam/fake/abuse: staff of the owning department or the admin; never a confidential issue. */
export function canFlagReports(user: User | null, issue: IssueAccessInfo): boolean {
  if (!user || issue.isConfidential) return false;
  if (user.role === "admin") return true;
  return user.role === "staff" && !!user.department && issue.department === user.department;
}

/** Trust explainer: the admin sees any student's ledger; a student sees only their own. */
export function canViewTrust(viewer: User | null, targetUserId: string): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  return viewer.role === "student" && viewer.id === targetUserId;
}
