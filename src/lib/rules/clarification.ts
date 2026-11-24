// Purpose: the clarification state machine for reports whose place is unknown/ambiguous/missing (R6, decision D20).
// Pure: no I/O. The student may answer up to config.clarification.maxAnswers times; after that the report stays
// visible to the admin only. A report in clarification is NEVER routed.
import { config } from "@/lib/config";
import type { LocationDecision, LocationReason, LocationRef } from "./location";

export interface ClarificationState {
  attempts: number; // answers used so far
  maxAnswers: number;
  adminOnly: boolean;
  reason: LocationReason;
  question: string;
  suggestionIds: string[];
  history: { answer: string; outcome: "resolved" | "unresolved"; at: string }[];
}

export function startClarification(decision: LocationDecision): ClarificationState {
  if (decision.status !== "needs_clarification" || !decision.reason || !decision.question) {
    throw new Error("startClarification: decision does not need clarification");
  }
  return {
    attempts: 0,
    maxAnswers: config.clarification.maxAnswers,
    adminOnly: false,
    reason: decision.reason,
    question: decision.question,
    suggestionIds: decision.suggestions.map((s) => s.id),
    history: [],
  };
}

export type AnswerOutcome =
  | { kind: "resolved"; state: ClarificationState; location: LocationRef }
  | { kind: "retry"; state: ClarificationState; remaining: number }
  | { kind: "escalated"; state: ClarificationState }
  | { kind: "closed"; state: ClarificationState };

/**
 * Apply one answer. `answerDecision` is the location decision computed from the answer (null if the answer was a
 * validated pick of one of the offered suggestions, in which case `picked` is that location).
 */
export function applyAnswer(
  state: ClarificationState,
  answer: string,
  result: { picked: LocationRef } | { decision: LocationDecision },
  now: Date = new Date(),
): AnswerOutcome {
  if (state.adminOnly || state.attempts >= state.maxAnswers) return { kind: "closed", state };

  const attempts = state.attempts + 1;
  const at = now.toISOString();
  const resolved = "picked" in result ? result.picked : result.decision.status === "resolved" ? result.decision.location : null;

  if (resolved) {
    return {
      kind: "resolved",
      location: resolved,
      state: { ...state, attempts, history: [...state.history, { answer, outcome: "resolved", at }] },
    };
  }

  const history = [...state.history, { answer, outcome: "unresolved" as const, at }];
  const next: ClarificationState = { ...state, attempts, history };
  // Refresh the question/options from the latest answer when we learned something new.
  if (!("picked" in result) && result.decision.question) {
    next.question = result.decision.question;
    next.reason = result.decision.reason ?? state.reason;
    next.suggestionIds = result.decision.suggestions.map((s) => s.id);
  }
  if (attempts >= state.maxAnswers) return { kind: "escalated", state: { ...next, adminOnly: true } };
  return { kind: "retry", state: next, remaining: state.maxAnswers - attempts };
}
