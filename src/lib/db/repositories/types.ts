// Purpose: shared domain types for the data-access layer.
// The repository interfaces below are the ONLY way services read/write data (DB is swappable).

// Same list as src/data/departments.json (a test keeps them equal). There is no separate "Labs" department.
export const DEPARTMENTS = ["EE", "CSE", "IS", "Library", "Cafeteria"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type Role = "student" | "staff" | "admin";

/** Safe-to-expose user shape. */
export interface User {
  id: string;
  name: string;
  role: Role;
  department: Department | null;
  trustScore: number;
  createdAt: string;
}

export interface UserRepository {
  list(): Promise<User[]>;
  getById(id: string): Promise<User | null>;
  createStudent(name: string): Promise<User>;
  /** Insert the demo users and matching 'seed' trust events. */
  seedDemoUsers(): Promise<number>;
  /** Trust inputs for the weight rule: score, account age, ledger size. */
  trustProfiles(userIds: string[]): Promise<TrustProfileRow[]>;
  /**
   * The trust score computed from the LEDGER (50 + sum of events, clamped), never from a cache. If the cached score on the
   * user row disagrees, it is repaired on the spot. This is what every screen shows.
   */
  ledgerScore(userId: string): Promise<number | null>;
}

export interface SystemRepository {
  /** Calls the reset_all_data() SQL function (wipes every table). */
  resetAllData(): Promise<void>;
}

// ------------------------------------------------------------------ reports

export type ReportStatus = "received" | "needs_clarification" | "routed" | "grouped" | "rejected";

export interface Report {
  id: string;
  userId: string;
  issueId: string | null;
  rawText: string;
  language: string | null;
  /** Gazetteer location id (e.g. "ee-lab-1"); null until the place is resolved. */
  canonicalLocation: string | null;
  extracted: Record<string, unknown>;
  /** Net flags + clarification state (flags.clarification). */
  flags: Record<string, unknown>;
  aiMode: "gemini" | "fallback" | null;
  isConfidential: boolean;
  status: ReportStatus;
  /** Set when issue creation failed after the report was saved ("needs attention" admin entry). */
  attention: string | null;
  createdAt: string;
}

export interface NewReport {
  userId: string;
  rawText: string;
  language: string | null;
  canonicalLocation: string | null;
  extracted: Record<string, unknown>;
  flags: Record<string, unknown>;
  aiMode: "gemini" | "fallback";
  isConfidential: boolean;
  status: ReportStatus;
}

export interface ReportRepository {
  insert(r: NewReport): Promise<Report>;
  getById(id: string): Promise<Report | null>;
  /** Only the author's own reports. */
  listByUser(userId: string): Promise<Report[]>;
  /**
   * Compare-and-set update of a report that is waiting for clarification. Succeeds only if the stored
   * clarification attempts still equal `expectedAttempts` (guards against two simultaneous answers).
   * Returns the updated report, or null if the guard failed.
   */
  updateClarification(
    id: string,
    expectedAttempts: number,
    patch: { status: ReportStatus; canonicalLocation: string | null; flags: Record<string, unknown> },
  ): Promise<Report | null>;
  /** Reports whose clarification limit was reached (admin-only queue). Never includes confidential reports. */
  listAdminClarifications(): Promise<Report[]>;
  /** Set (or clear with null) the "needs attention" marker. */
  markAttention(id: string, reason: string | null): Promise<void>;
  /** Saved reports that never got an issue: marked failures plus reports stuck unattached for a while. */
  listNeedsAttention(): Promise<Report[]>;
}

// ------------------------------------------------------------------- issues

export type IssueStatus = "open" | "in_progress" | "resolved" | "reopened" | "closed";
export type Priority = "low" | "medium" | "high" | "critical";

export interface Issue {
  id: string;
  canonicalLocation: string | null;
  category: string;
  signature: string;
  department: Department | null;
  priority: Priority;
  priorityScore: number;
  priorityBreakdown: Record<string, unknown>;
  status: IssueStatus;
  isConfidential: boolean;
  meTooCount: number;
  oneLineReason: string | null;
  resolutionRound: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** End of the current resolution round's voting window (set when staff mark it resolved). */
  voteDeadline: string | null;
}

export interface NewIssueInput {
  canonicalLocation: string | null;
  category: string;
  signature: string;
  department: Department | null;
  priority: Priority;
  priorityScore: number;
  priorityBreakdown: Record<string, unknown>;
  isConfidential: boolean;
  oneLineReason: string;
}

export interface IssueUpdateRow {
  id: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
  /** Staff/admin actors only; students are never listed as actors. */
  actor: { role: Role; department: Department | null } | null;
}

export interface TrustProfileRow {
  userId: string;
  trustScore: number;
  createdAt: string;
  ledgerEvents: number;
}

export type VoteKind = "confirm" | "dispute";

export interface BundleReport {
  id: string;
  text: string;
  language: string | null;
  createdAt: string;
  flagged: "spam" | "fake" | "abuse" | null;
}

/** Everything the issue page needs, from ONE database call. */
export interface IssueBundle {
  issue: Issue;
  myRole: "reporter" | "joined" | null;
  myExcluded: boolean;
  /** Counted (not flagged) affected students. */
  members: number;
  /** The current round's voting pool: who may vote (frozen when the issue was resolved) and their total weight. */
  pool: { members: number; weight: number; mine: boolean };
  updates: IssueUpdateRow[];
  /** Empty for a confidential issue unless includeReports was requested. Carries no user ids. */
  reports: BundleReport[];
  /** Tally of the current resolution round (null for a confidential issue). */
  votes: { round: number; confirmN: number; disputeN: number; confirmW: number; disputeW: number; myVote: VoteKind | null } | null;
}

export interface StudentIssueRow {
  issue: Issue;
  role: "reporter" | "joined";
  excluded: boolean;
  /** I am in the current round's voting pool (I had joined before the fix was reported). */
  inPool: boolean;
  /** My vote in the issue's current resolution round. */
  myVote: VoteKind | null;
}

export interface VoteResult {
  outcome: "pending" | "reopened" | "closed";
  status: IssueStatus;
  confirmN: number;
  disputeN: number;
  confirmW: number;
  disputeW: number;
  members: number;
  /** Total weight of the round's pool. */
  poolWeight: number;
  round: number;
  closeReason: "early_majority" | "all_voted" | null;
}

export interface VoteRepository {
  /**
   * Atomic: vote (weight frozen in the round's pool) + tally + reopen/close + trust events.
   * Throws Error(code): not_affected | joined_late | voting_closed | window_ended | already_voted | issue_not_found.
   */
  cast(issueId: string, userId: string, vote: VoteKind, cfg: Record<string, unknown>): Promise<VoteResult>;
}

export interface TrustEventRow {
  id: string;
  delta: number;
  reason: string;
  kind: string | null;
  createdAt: string;
}

export interface TrustRepository {
  /** The full ledger of one user, oldest first. Events tied to a confidential issue are never returned. */
  listEvents(userId: string): Promise<TrustEventRow[]>;
}

export interface IssueRepository {
  attachNew(reportId: string, input: NewIssueInput): Promise<string>;
  attachJoin(
    reportId: string,
    issueId: string,
    p: { priority: Priority; score: number; breakdown: Record<string, unknown> },
  ): Promise<{ joined: boolean; meTooCount: number }>;
  getById(id: string): Promise<Issue | null>;
  /** Non-confidential, not closed, at this place. */
  listGroupingCandidates(locationId: string): Promise<Issue[]>;
  /** Issues the student reported or joined (a confidential one only if they are its reporter), with their role. */
  listForStudent(userId: string): Promise<StudentIssueRow[]>;
  /** Issue page data in one call. includeReports matters only for confidential issues (admin / own reporter). */
  bundle(issueId: string, userId: string, includeReports: boolean): Promise<IssueBundle | null>;
  /** Trust inputs of the counted members of an issue. */
  memberTrustProfiles(issueId: string): Promise<TrustProfileRow[]>;
  /** Staff/admin flag a report. Atomic with the trust event. */
  flagReport(reportId: string, actorId: string, kind: "spam" | "fake" | "abuse", note: string | null, delta: number, reason: string): Promise<{ issueId: string | null; meTooCount: number; closed: boolean }>;
  /** NON-confidential issues of one department. */
  listForDepartment(dept: Department): Promise<Issue[]>;
  /** All NON-confidential issues (admin overview). */
  listPublic(): Promise<Issue[]>;
  /** Confidential issues (admin only). Never includes reporter identity. */
  listConfidential(): Promise<Issue[]>;
  memberRole(issueId: string, userId: string): Promise<"reporter" | "joined" | null>;
  memberUserIds(issueId: string): Promise<string[]>;
  listUpdates(issueId: string): Promise<IssueUpdateRow[]>;
  /** Report texts of an issue (no identities). Confidential issues return nothing unless includeConfidential is set (admin / own reporter only). */
  listReportTexts(issueId: string, opts?: { includeConfidential?: boolean }): Promise<{ text: string; language: string | null; createdAt: string }[]>;
  updatePriority(issueId: string, p: { priority: Priority; score: number; breakdown: Record<string, unknown> }): Promise<void>;
  changeStatus(
    issueId: string,
    actorId: string,
    from: IssueStatus,
    to: IssueStatus,
    note: string | null,
    opts?: {
      validate?: { delta: number; reason: string };
      /** When resolving: the affected students and their weights, frozen as the round's voting pool. */
      pool?: { userId: string; weight: number }[];
      windowSeconds?: number;
    },
  ): Promise<{ status: IssueStatus; resolutionRound: number; voteDeadline: string | null }>;
  /** Close resolved issues whose voting window ended without a reopen (one issue, or all when null). Returns how many closed. */
  settleDue(issueId: string | null, cfg: Record<string, unknown>): Promise<number>;
}
