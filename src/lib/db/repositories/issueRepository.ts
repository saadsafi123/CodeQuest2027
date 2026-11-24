// Purpose: data access for issues. CONFIDENTIALITY LIVES HERE: every list except listConfidential() filters
// is_confidential = false in the query, grouping candidates exclude confidential issues, and no function returns the
// reporter's identity for a confidential issue. Services re-check, but this is the first line of defence.
import "server-only";
import { getSupabase } from "../supabase";
import type {
  BundleReport, Department, Issue, IssueBundle, IssueRepository, IssueStatus, IssueUpdateRow, NewIssueInput, Priority, Role, StudentIssueRow, TrustProfileRow, VoteKind,
} from "./types";

interface Row {
  id: string;
  canonical_location: string | null;
  category: string;
  signature: string;
  department: Department | null;
  priority: Priority;
  priority_score: number | string;
  priority_breakdown: Record<string, unknown> | null;
  status: IssueStatus;
  is_confidential: boolean;
  me_too_count: number;
  one_line_reason: string | null;
  resolution_round: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  vote_deadline: string | null;
}

const toIssue = (r: Row): Issue => ({
  id: r.id,
  canonicalLocation: r.canonical_location,
  category: r.category,
  signature: r.signature,
  department: r.department,
  priority: r.priority,
  priorityScore: Number(r.priority_score),
  priorityBreakdown: r.priority_breakdown ?? {},
  status: r.status,
  isConfidential: r.is_confidential,
  meTooCount: r.me_too_count,
  oneLineReason: r.one_line_reason,
  resolutionRound: r.resolution_round,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  resolvedAt: r.resolved_at,
  voteDeadline: r.vote_deadline ?? null,
});

const db = () => getSupabase();
function fail(what: string, e: { message: string }): never {
  throw new Error(`issues.${what} failed: ${e.message}`);
}

export const issueRepository: IssueRepository = {
  async attachNew(reportId, i: NewIssueInput) {
    const { data, error } = await db().rpc("attach_report_new_issue", {
      p_report_id: reportId,
      p_issue: {
        canonical_location: i.canonicalLocation ?? "",
        category: i.category,
        signature: i.signature,
        department: i.department ?? "",
        priority: i.priority,
        priority_score: i.priorityScore,
        priority_breakdown: i.priorityBreakdown,
        is_confidential: i.isConfidential,
        one_line_reason: i.oneLineReason,
      },
    });
    if (error) fail("attachNew", error);
    return data as string;
  },

  async attachJoin(reportId, issueId, p) {
    const { data, error } = await db().rpc("attach_report_to_issue", {
      p_report_id: reportId,
      p_issue_id: issueId,
      p_priority: p.priority,
      p_priority_score: p.score,
      p_priority_breakdown: p.breakdown,
    });
    if (error) fail("attachJoin", error);
    const d = data as { joined: boolean; me_too_count: number };
    return { joined: d.joined, meTooCount: d.me_too_count };
  },

  async getById(id) {
    const { data, error } = await db().from("issues").select("*").eq("id", id).maybeSingle();
    if (error) fail("getById", error);
    return data ? toIssue(data as Row) : null;
  },

  async listGroupingCandidates(locationId) {
    const { data, error } = await db()
      .from("issues")
      .select("*")
      .eq("canonical_location", locationId)
      .eq("is_confidential", false)
      .neq("status", "closed")
      .order("created_at", { ascending: true });
    if (error) fail("listGroupingCandidates", error);
    return (data as Row[]).map(toIssue);
  },

  async listForStudent(userId) {
    const { data, error } = await db().rpc("student_issues", { p_user_id: userId });
    if (error) fail("listForStudent", error);
    const rows = (data ?? []) as { issue: Row; role: "reporter" | "joined"; excluded: boolean; in_pool: boolean; my_vote: VoteKind | null }[];
    return rows.map<StudentIssueRow>((r) => ({ issue: toIssue(r.issue), role: r.role, excluded: r.excluded, inPool: r.in_pool, myVote: r.my_vote }));
  },

  async bundle(issueId, userId, includeReports) {
    const { data, error } = await db().rpc("issue_bundle", { p_issue_id: issueId, p_user_id: userId, p_include_reports: includeReports });
    if (error) fail("bundle", error);
    if (!data) return null;
    const b = data as {
      issue: Row;
      my_role: "reporter" | "joined" | null;
      my_excluded: boolean;
      members: number;
      pool: { members: number; weight: number | string; mine: boolean } | null;
      updates: { id: string; from: string | null; to: string | null; note: string | null; at: string; actor_role: Role | null; actor_department: Department | null }[];
      reports: { id: string; text: string; language: string | null; at: string; flagged: "spam" | "fake" | "abuse" | null }[];
      votes: { round: number; confirm_n: number; dispute_n: number; confirm_w: number | string; dispute_w: number | string; my_vote: VoteKind | null } | null;
    };
    const issue = toIssue(b.issue);
    return {
      issue,
      myRole: b.my_role,
      myExcluded: b.my_excluded,
      members: Number(b.members),
      pool: { members: Number(b.pool?.members ?? 0), weight: Number(b.pool?.weight ?? 0), mine: !!b.pool?.mine },
      updates: b.updates.map<IssueUpdateRow>((u) => ({
        id: u.id,
        fromStatus: u.from,
        toStatus: u.to,
        note: u.note,
        createdAt: u.at,
        actor: u.actor_role ? { role: u.actor_role, department: u.actor_department } : null,
      })),
      // reports of a confidential issue never carry ids (they cannot be flagged), whatever the caller asked for
      reports: b.reports.map<BundleReport>((r) => ({ id: issue.isConfidential ? "" : r.id, text: r.text, language: r.language, createdAt: r.at, flagged: r.flagged })),
      votes: b.votes
        ? { round: b.votes.round, confirmN: Number(b.votes.confirm_n), disputeN: Number(b.votes.dispute_n), confirmW: Number(b.votes.confirm_w), disputeW: Number(b.votes.dispute_w), myVote: b.votes.my_vote }
        : null,
    } satisfies IssueBundle;
  },

  async memberTrustProfiles(issueId) {
    const { data, error } = await db().rpc("member_trust_profiles", { p_issue_id: issueId });
    if (error) fail("memberTrustProfiles", error);
    return ((data ?? []) as { user_id: string; trust_score: number | string; created_at: string; ledger_events: number | string }[]).map<TrustProfileRow>((r) => ({
      userId: r.user_id,
      trustScore: Number(r.trust_score),
      createdAt: r.created_at,
      ledgerEvents: Number(r.ledger_events),
    }));
  },

  async flagReport(reportId, actorId, kind, note, delta, reason) {
    const { data, error } = await db().rpc("flag_report", { p_report_id: reportId, p_actor: actorId, p_kind: kind, p_note: note ?? "", p_delta: delta, p_reason: reason });
    if (error) {
      if (/already_flagged/.test(error.message)) throw new Error("already_flagged");
      if (/report_not_found/.test(error.message)) throw new Error("report_not_found");
      fail("flagReport", error);
    }
    const d = data as { issue_id: string | null; me_too_count: number; closed: boolean };
    return { issueId: d.issue_id, meTooCount: Number(d.me_too_count), closed: d.closed };
  },

  async listForDepartment(dept) {
    const { data, error } = await db().from("issues").select("*").eq("department", dept).eq("is_confidential", false);
    if (error) fail("listForDepartment", error);
    return (data as Row[]).map(toIssue);
  },

  async listPublic() {
    const { data, error } = await db().from("issues").select("*").eq("is_confidential", false);
    if (error) fail("listPublic", error);
    return (data as Row[]).map(toIssue);
  },

  async listConfidential() {
    const { data, error } = await db().from("issues").select("*").eq("is_confidential", true).order("created_at", { ascending: false });
    if (error) fail("listConfidential", error);
    return (data as Row[]).map(toIssue);
  },

  async memberRole(issueId, userId) {
    const { data, error } = await db().from("issue_members").select("role").eq("issue_id", issueId).eq("user_id", userId).maybeSingle();
    if (error) fail("memberRole", error);
    return (data?.role as "reporter" | "joined" | undefined) ?? null;
  },

  async memberUserIds(issueId) {
    const { data, error } = await db().from("issue_members").select("user_id").eq("issue_id", issueId);
    if (error) fail("memberUserIds", error);
    return ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
  },

  async listUpdates(issueId) {
    const { data, error } = await db()
      .from("issue_updates")
      .select("id,actor_id,from_status,to_status,note,created_at")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true });
    if (error) fail("listUpdates", error);
    const rows = (data ?? []) as { id: string; actor_id: string | null; from_status: string | null; to_status: string | null; note: string | null; created_at: string }[];
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
    const actors = new Map<string, { role: Role; department: Department | null }>();
    if (actorIds.length) {
      const { data: us } = await db().from("users").select("id,role,department").in("id", actorIds);
      for (const u of (us ?? []) as { id: string; role: Role; department: Department | null }[]) {
        // students are never exposed as actors
        if (u.role !== "student") actors.set(u.id, { role: u.role, department: u.department });
      }
    }
    return rows.map<IssueUpdateRow>((r) => ({
      id: r.id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      note: r.note,
      createdAt: r.created_at,
      actor: r.actor_id ? (actors.get(r.actor_id) ?? null) : null,
    }));
  },

  async listReportTexts(issueId, opts) {
    const { data: issue } = await db().from("issues").select("is_confidential").eq("id", issueId).maybeSingle();
    if (!issue || (issue.is_confidential && !opts?.includeConfidential)) return []; // confidential: only when explicitly allowed
    const { data, error } = await db()
      .from("reports")
      .select("raw_text,language,created_at")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true });
    if (error) fail("listReportTexts", error);
    return ((data ?? []) as { raw_text: string; language: string | null; created_at: string }[]).map((r) => ({
      text: r.raw_text,
      language: r.language,
      createdAt: r.created_at,
    }));
  },

  async updatePriority(issueId, p) {
    const { error } = await db()
      .from("issues")
      .update({ priority: p.priority, priority_score: p.score, priority_breakdown: p.breakdown, updated_at: new Date().toISOString() })
      .eq("id", issueId);
    if (error) fail("updatePriority", error);
  },

  async changeStatus(issueId, actorId, from, to, note, opts) {
    const { data, error } = await db().rpc("update_issue_status", {
      p_issue_id: issueId,
      p_actor: actorId,
      p_from: from,
      p_to: to,
      p_note: note ?? "",
      p_validate_delta: opts?.validate?.delta ?? 0,
      p_validate_reason: opts?.validate?.reason ?? "",
      p_pool: opts?.pool ? opts.pool.map((p) => ({ user_id: p.userId, weight: p.weight })) : null,
      p_window_seconds: Math.round(opts?.windowSeconds ?? 0),
    });
    if (error) {
      if (/stale_status/.test(error.message)) throw new Error("stale_status");
      fail("changeStatus", error);
    }
    const d = data as { status: IssueStatus; resolution_round: number; vote_deadline: string | null };
    return { status: d.status, resolutionRound: Number(d.resolution_round), voteDeadline: d.vote_deadline ?? null };
  },

  async settleDue(issueId, cfg) {
    const { data, error } = await db().rpc("settle_resolution", { p_issue_id: issueId, p_cfg: cfg });
    if (error) fail("settleDue", error);
    return Number(data ?? 0);
  },
};
