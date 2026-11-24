// Purpose: data access for reports. Confidentiality note: this repository returns a report only by id (callers must
// check ownership/role in the service) or the author's own list. There is NO "list all" here; admin/department
// listings arrive in later phases and MUST filter is_confidential in this file.
import "server-only";
import { config } from "@/lib/config";
import { getSupabase } from "../supabase";
import type { NewReport, Report, ReportRepository, ReportStatus } from "./types";

interface Row {
  id: string;
  user_id: string;
  issue_id: string | null;
  raw_text: string;
  language: string | null;
  canonical_location: string | null;
  extracted: Record<string, unknown>;
  flags: Record<string, unknown>;
  ai_mode: "gemini" | "fallback" | null;
  is_confidential: boolean;
  status: ReportStatus;
  attention: string | null;
  created_at: string;
}

const toReport = (r: Row): Report => ({
  id: r.id,
  userId: r.user_id,
  issueId: r.issue_id,
  rawText: r.raw_text,
  language: r.language,
  canonicalLocation: r.canonical_location,
  extracted: r.extracted ?? {},
  flags: r.flags ?? {},
  aiMode: r.ai_mode,
  isConfidential: r.is_confidential,
  status: r.status,
  attention: r.attention ?? null,
  createdAt: r.created_at,
});

export const reportRepository: ReportRepository = {
  async insert(r: NewReport) {
    const { data, error } = await getSupabase()
      .from("reports")
      .insert({
        user_id: r.userId,
        raw_text: r.rawText,
        language: r.language,
        canonical_location: r.canonicalLocation,
        extracted: r.extracted,
        flags: r.flags,
        ai_mode: r.aiMode,
        is_confidential: r.isConfidential,
        status: r.status,
      })
      .select("*")
      .single();
    if (error) throw new Error(`reports.insert failed: ${error.message}`);
    return toReport(data as Row);
  },

  async getById(id) {
    const { data, error } = await getSupabase().from("reports").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`reports.getById failed: ${error.message}`);
    return data ? toReport(data as Row) : null;
  },

  async listByUser(userId) {
    const { data, error } = await getSupabase()
      .from("reports")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`reports.listByUser failed: ${error.message}`);
    return (data as Row[]).map(toReport);
  },

  async listAdminClarifications() {
    const { data, error } = await getSupabase()
      .from("reports")
      .select("*")
      .eq("status", "needs_clarification")
      .eq("is_confidential", false)
      .eq("flags->clarification->>adminOnly", "true")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`reports.listAdminClarifications failed: ${error.message}`);
    return (data as Row[]).map(toReport);
  },

  async updateClarification(id, expectedAttempts, patch) {
    const { data, error } = await getSupabase()
      .from("reports")
      .update({ status: patch.status, canonical_location: patch.canonicalLocation, flags: patch.flags })
      .eq("id", id)
      .eq("status", "needs_clarification")
      .eq("flags->clarification->>attempts", String(expectedAttempts))
      .select("*");
    if (error) throw new Error(`reports.updateClarification failed: ${error.message}`);
    return data && data.length === 1 ? toReport(data[0] as Row) : null;
  },

  async markAttention(id, reason) {
    const { error } = await getSupabase().from("reports").update({ attention: reason }).eq("id", id);
    if (error) throw new Error(`reports.markAttention failed: ${error.message}`);
  },

  async listNeedsAttention() {
    // stuck = saved, never attached to an issue, older than a normal pipeline run
    const stuckBefore = new Date(Date.now() - config.reliability.stuckReportAfterMs).toISOString();
    const { data, error } = await getSupabase()
      .from("reports")
      .select("*")
      .or(`attention.not.is.null,and(status.eq.received,issue_id.is.null,created_at.lt.${stuckBefore})`)
      .is("issue_id", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`reports.listNeedsAttention failed: ${error.message}`);
    // a report with no place that is not confidential cannot be routed by a retry: it belongs to the clarification flow
    return (data as Row[]).map(toReport).filter((r) => r.attention !== null || r.isConfidential || r.canonicalLocation !== null);
  },
};
