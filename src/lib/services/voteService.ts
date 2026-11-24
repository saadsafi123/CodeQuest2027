// Purpose: resolution voting. Only affected students (reporters + joiners, not flagged) vote, once per resolution round.
// The server decides eligibility, the weight comes from the trust ledger (never from the client), and the vote, tally,
// reopen/close decision and trust events run as ONE database transaction (cast_resolution_vote).
import "server-only";
import { issueRepository, voteRepository, type User, type VoteKind, type VoteResult } from "@/lib/db/repositories";
import { voteRpcConfig } from "@/lib/rules/voting";
import { ServiceError } from "./errors";
import { refreshIssuePriority } from "./priorityService";
import { invalidateUser } from "./userService";

export interface VoteOutcomeView extends VoteResult {
  message: string;
}

const MESSAGES: Record<VoteResult["outcome"], string> = {
  pending: "Thanks, your vote was counted.",
  reopened: "Your vote was counted. Enough affected students disputed the fix, so the issue was reopened.",
  closed: "Your vote was counted. Enough affected students confirmed the fix: the issue is closed.",
};

export async function castVote(user: User | null, issueId: string, vote: VoteKind): Promise<VoteOutcomeView> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  if (user.role !== "student") throw new ServiceError("forbidden", "Only the affected students can vote on a fix.");

  // The vote weight is frozen in the round's voting pool (computed from the trust ledger when staff resolved the issue);
  // the client never supplies it. The database function checks everything atomically: affected, in the pool, window, one vote.
  try {
    const result = await voteRepository.cast(issueId, user.id, vote, voteRpcConfig());
    if (result.outcome !== "pending") invalidateUser(); // trust events were written for matching votes
    await refreshIssuePriority(issueId).catch(() => {}); // the crowd weights may have changed
    const message = result.outcome === "closed" && result.closeReason === "early_majority" ? "Your vote was counted. A weighted majority of the affected students confirmed the fix, so the issue closed early." : MESSAGES[result.outcome];
    return { ...result, message };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "already_voted") throw new ServiceError("conflict", "You already voted on this fix.");
    if (code === "not_affected") throw new ServiceError("forbidden", "Only students affected by this issue can vote.");
    if (code === "joined_late") throw new ServiceError("forbidden", "You joined after the fix was reported, so your vote is not counted in this round. You can vote if it is resolved again.");
    if (code === "voting_closed") throw new ServiceError("conflict", "Voting is only open while an issue is marked resolved.");
    if (code === "window_ended") {
      await issueRepository.settleDue(issueId, voteRpcConfig()).catch(() => {}); // the window ended: close it now
      invalidateUser();
      throw new ServiceError("conflict", "The voting window for this fix has ended, so the issue was closed.");
    }
    if (code === "issue_not_found") throw new ServiceError("not_found", "Issue not found.");
    throw e;
  }
}
