// Purpose: data access for resolution votes. The vote, the tally, the reopen/close decision and the trust events
// happen inside ONE Postgres function (cast_resolution_vote), so they are atomic. Never returns who voted what.
import "server-only";
import { getSupabase } from "../supabase";
import type { IssueStatus, VoteRepository } from "./types";

const KNOWN = ["not_affected", "joined_late", "voting_closed", "window_ended", "already_voted", "issue_not_found", "bad_vote"] as const;

export const voteRepository: VoteRepository = {
  async cast(issueId, userId, vote, cfg) {
    const { data, error } = await getSupabase().rpc("cast_resolution_vote", {
      p_issue_id: issueId,
      p_user_id: userId,
      p_vote: vote,
      p_cfg: cfg,
    });
    if (error) {
      const code = KNOWN.find((k) => error.message.includes(k));
      if (code) throw new Error(code);
      throw new Error(`votes.cast failed: ${error.message}`);
    }
    const d = data as { outcome: "pending" | "reopened" | "closed"; status: IssueStatus; confirm_n: number; dispute_n: number; confirm_w: number | string; dispute_w: number | string; members: number; pool_weight: number | string; round: number; close_reason: "early_majority" | "all_voted" | null };
    return {
      outcome: d.outcome,
      status: d.status,
      confirmN: Number(d.confirm_n),
      disputeN: Number(d.dispute_n),
      confirmW: Number(d.confirm_w),
      disputeW: Number(d.dispute_w),
      members: Number(d.members),
      poolWeight: Number(d.pool_weight),
      round: Number(d.round),
      closeReason: d.close_reason ?? null,
    };
  },
};
