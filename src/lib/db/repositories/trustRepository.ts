// Purpose: data access for the trust ledger (read side). Writes happen only inside the SQL functions
// (apply_trust_event and the functions that call it), so a score can never change without a ledger row.
import "server-only";
import { getSupabase } from "../supabase";
import type { TrustRepository } from "./types";

export const trustRepository: TrustRepository = {
  async listEvents(userId) {
    const { data, error } = await getSupabase()
      .from("trust_events")
      .select("id,delta,reason,kind,created_at,issues:related_issue_id(is_confidential)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`trust.listEvents failed: ${error.message}`);
    type Row = { id: string; delta: number | string; reason: string; kind: string | null; created_at: string; issues: { is_confidential: boolean } | { is_confidential: boolean }[] | null };
    return (data as unknown as Row[])
      .filter((r) => {
        const i = Array.isArray(r.issues) ? r.issues[0] : r.issues;
        return !i?.is_confidential; // defence in depth: nothing tied to a confidential issue is ever listed
      })
      .map((r) => ({ id: r.id, delta: Number(r.delta), reason: r.reason, kind: r.kind, createdAt: r.created_at }));
  },
};
