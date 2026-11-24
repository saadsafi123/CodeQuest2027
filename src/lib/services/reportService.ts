// Purpose: the report pipeline. understand (AI or fallback + nets) -> validate place -> [clarify] -> group ("me too")
// or create issue -> priority -> route. AI only understands text; every decision below is code.
//   - unknown / ambiguous / missing place: stored as needs_clarification and NEVER routed
//   - confidential (harassment/ragging): its own issue, never grouped, never routed to a department
//   - same problem at the same place: joins the existing issue (me-too); different problem: new issue
import "server-only";
import { analyzeReport, type AnalyzedReport } from "@/lib/ai/analyze";
import { findSameProblem } from "@/lib/ai/compare";
import { EmptyReportError, prepareReportText } from "@/lib/ai/extract";
import { extractLocationMention } from "@/lib/ai/fallback";
import type { Extraction } from "@/lib/ai/schema";
import { issueRepository, reportRepository, userRepository, type Issue, type Report, type User } from "@/lib/db/repositories";
import { applyAnswer, startClarification, type ClarificationState } from "@/lib/rules/clarification";
import { acceptVerdict, selectCandidates, type GroupableIssue } from "@/lib/rules/grouping";
import { decideLocation, getLocationById, type LocationDecision, type LocationRef } from "@/lib/rules/location";
import { canAnswerClarification, canSubmitReport, isAdmin } from "@/lib/rules/permissions";
import { routeIssue, type Route } from "@/lib/rules/routing";
import { cleanHint, reconcilePlace, type OptionTag, type PlaceHint } from "@/lib/rules/placeHint";
import { detectInjection } from "@/lib/rules/injection";
import { sanitizeReportText } from "@/lib/rules/text";
import { createHash } from "node:crypto";
import { ServiceError } from "./errors";
import { computePriority } from "@/lib/rules/priority";
import { config } from "@/lib/config";
import { hazardOf, refreshIssuePriority, weightsFromProfiles } from "./priorityService";

/** What the author sees. Confidential reports reveal nothing beyond an acknowledgement. */
export interface PlacePromptView {
  reason: "no_place" | "conflict" | "unknown_with_hint";
  question: string;
  /** Tappable answers. The student may also pick any other place with the department -> place picker. */
  options: { id: string; name: string; department: string | null; tag?: OptionTag }[];
}

export interface ReportView {
  /** Empty while status is "needs_place": nothing has been saved yet. */
  id: string;
  /** "needs_place", "needs_problem" and "needs_confirm" are not stored statuses: the question is asked BEFORE the report is saved or routed. */
  status: Report["status"] | "needs_place" | "needs_problem" | "needs_confirm";
  placePrompt?: PlacePromptView;
  /** "needs_problem": the AI could not tell what the problem is and asks one question. Nothing has been saved. */
  followUp?: { question: string };
  /** "needs_confirm": everything is clear; the student checks this summary and confirms. Nothing has been saved yet. */
  summary?: { problem: string; place: { id: string; name: string } | null; confidential: boolean };
  confidential: boolean;
  message: string;
  location: { id: string; name: string; department: string | null } | null;
  clarification: {
    question: string;
    suggestions: { id: string; name: string }[];
    answersRemaining: number;
    adminOnly: boolean;
  } | null;
  /** The report was saved but routing failed; the admin was alerted and it will be retried. Nothing is lost. */
  needsAttention?: boolean;
  /** The issue this report ended up in (never set for confidential reports). */
  issue: { id: string; priority: string; status: string; meToo: number; department: string | null; joinedExisting: boolean; alreadyCounted: boolean } | null;
}

type Outcome = { issue: Issue; joinedExisting: boolean; alreadyCounted: boolean };

const ref = (l: LocationRef) => ({ id: l.id, name: l.name, department: l.owner });

function clarificationOf(report: Report): ClarificationState | null {
  const c = report.flags.clarification as ClarificationState | undefined;
  return c && typeof c.attempts === "number" ? c : null;
}

export function placePromptView(r: { reason: PlacePromptView["reason"]; question: string; options: { id: string; name: string; owner: string | null; tag?: OptionTag }[] }): ReportView {
  return {
    id: "",
    status: "needs_place",
    confidential: false,
    message: r.question,
    location: null,
    clarification: null,
    issue: null,
    placePrompt: { reason: r.reason, question: r.question, options: r.options.map((o) => ({ id: o.id, name: o.name, department: o.owner, tag: o.tag })) },
  };
}

export function toReportView(report: Report, outcome?: Outcome | null): ReportView {
  const base = { id: report.id, status: report.status };
  if (report.isConfidential) {
    return {
      ...base,
      confidential: true,
      message: "Your report was received and will be handled confidentially. Your identity is not shared.",
      location: null,
      clarification: null,
      issue: null,
    };
  }
  const loc = report.canonicalLocation ? getLocationById(report.canonicalLocation) : null;
  const c = report.status === "needs_clarification" ? clarificationOf(report) : null;
  const stuck = !outcome && !report.issueId && report.status === "received" && report.attention !== null;
  let message = "Report received.";
  if (stuck) message = "Your report was saved, but we could not finish routing it just now. The admin has been alerted and it will be retried. Nothing is lost.";
  else if (c?.adminOnly) message = "We could not identify the place. Your report has been passed to the admin for review.";
  else if (c) message = c.question;
  else if (outcome) {
    const where = loc?.name ?? "campus";
    const i = outcome.issue;
    if (outcome.alreadyCounted) message = `You already reported this problem at ${where}. It is counted once (${i.meTooCount} affected).`;
    else if (outcome.joinedExisting) message = `This problem was already reported at ${where}. You were added as "me too" (${i.meTooCount} students affected).`;
    else if (i.department) message = `Sent to ${i.department} (${where}). Priority: ${i.priority}.`;
    else message = `Received for ${where}. No department owns this place, so the admin will assign it.`;
  } else if (loc) message = `Report received for ${loc.name}.`;
  return {
    ...base,
    confidential: false,
    message,
    ...(stuck ? { needsAttention: true } : {}),
    location: loc ? ref(loc) : null,
    clarification: c
      ? {
          question: c.question,
          suggestions: c.suggestionIds.flatMap((id) => {
            const l = getLocationById(id);
            return l ? [{ id: l.id, name: l.name }] : [];
          }),
          answersRemaining: Math.max(0, c.maxAnswers - c.attempts),
          adminOnly: c.adminOnly,
        }
      : null,
    issue: outcome
      ? {
          id: outcome.issue.id,
          priority: outcome.issue.priority,
          status: outcome.issue.status,
          meToo: outcome.issue.meTooCount,
          department: outcome.issue.department,
          joinedExisting: outcome.joinedExisting,
          alreadyCounted: outcome.alreadyCounted,
        }
      : null,
  };
}

/** One-line reason shown with the issue. Built from the AUTHORITATIVE routing facts (not the AI's guess), so it never contradicts where the issue went. */
export function explainRouting(args: { signature: string; hazardType: string | null; location: LocationRef | null; department: string | null; confidential: boolean; source?: Route["source"]; aiMode?: "gemini" | "fallback" }): string {
  if (args.confidential) return "Confidential report, handled by the admin only.";
  const what = args.signature.charAt(0).toUpperCase() + args.signature.slice(1);
  const where = args.location ? ` at ${args.location.name}` : "";
  const hazard = args.hazardType && args.hazardType !== "none" ? `Safety hazard (${args.hazardType})${where}. Always critical. ` : `${what}${where}. `;
  const by = args.aiMode === "fallback" ? "the rule-based reader" : "the AI";
  const who = !args.department
    ? "No department owns this place, so the admin will assign it."
    : args.source === "ai"
      ? `Routed to ${args.department} by ${by}.`
      : `Sent to ${args.department}, which owns that place.`;
  return hazard + who;
}

const toGroupable = (i: Issue): GroupableIssue => ({
  id: i.id,
  canonicalLocation: i.canonicalLocation,
  status: i.status,
  isConfidential: i.isConfidential,
  isHazard: hazardOf(i).isHazard,
  signature: i.signature,
  category: i.category,
  oneLineReason: i.oneLineReason,
});

/** Facts fetched in parallel with saving the report, so the pipeline does not wait for them one after another. */
interface Prefetched {
  existing?: Issue[];
  reporterProfile?: Awaited<ReturnType<typeof userRepository.trustProfiles>>;
}

/**
 * The AI's routing decision. When the place was NOT in the text (the student tapped, typed or picked it, or the admin
 * assigned it) the first reading never saw the place, so the AI reads the report once more WITH the settled place and
 * only its department answer is used. A failure here just keeps the first reading (routeIssue's safety net applies).
 */
async function aiDepartmentFor(report: Report, ex: Extraction, location: LocationRef | null): Promise<{ department: string; injection: boolean; mode: "gemini" | "fallback" }> {
  const first = { department: ex.department_guess as string, injection: ex.injection_attempt_detected, mode: (report.aiMode === "gemini" ? "gemini" : "fallback") as "gemini" | "fallback" };
  const src = (report.flags.location as { source?: string } | undefined)?.source;
  if (!location || src === "text") return first;
  try {
    const a = await analyzeCached(`${report.rawText}
Place: ${location.name}.`);
    return { department: a.extraction.department_guess, injection: first.injection || a.extraction.injection_attempt_detected, mode: a.mode };
  } catch {
    return first;
  }
}

/**
 * Everything after the place is settled: group or create, compute priority, route.
 * Safe to call once per report (the RPCs refuse a report that is already attached).
 */
async function completeReport(report: Report, location: LocationRef | null, pre: Prefetched = {}): Promise<Outcome> {
  const ex = report.extracted as unknown as Extraction;
  const confidential = report.isConfidential;
  const hazard = { isHazard: ex.safety_hazard.is_hazard, type: ex.safety_hazard.type };

  // ---- grouping (never for confidential reports). The same-problem AI check runs only when something is there to compare.
  let chosen: Issue | null = null;
  let existing: Issue[] = [];
  if (!confidential && location) {
    existing = pre.existing ?? (await issueRepository.listGroupingCandidates(location.id));
    const candidates = selectCandidates(existing.map(toGroupable), location.id);
    if (candidates.length > 0) {
      const verdict = await findSameProblem(
        { text: ex.normalized_text_en, signature: ex.problem_signature, category: ex.problem_category, hazard: hazard.isHazard },
        candidates.map((c) => ({ id: c.id, text: c.oneLineReason ?? c.signature, signature: c.signature, category: c.category, hazard: c.isHazard })),
      );
      const picked = candidates.find((c) => c.id === verdict.issueId) ?? null;
      const ok = acceptVerdict(picked, { isHazard: hazard.isHazard, confidential });
      if (ok) chosen = existing.find((i) => i.id === ok.id) ?? null;
    }
  }

  if (chosen) {
    // counted members' trust in ONE call (flagged reports no longer count), plus the joiner
    const [profiles, reporterProfile] = await Promise.all([
      issueRepository.memberTrustProfiles(chosen.id),
      pre.reporterProfile ? Promise.resolve(pre.reporterProfile) : userRepository.trustProfiles([report.userId]),
    ]);
    const ids = [...new Set([...profiles.map((p) => p.userId), report.userId])];
    const members = weightsFromProfiles(ids, [...profiles, ...reporterProfile]);
    const p = computePriority({ category: chosen.category, hazard: hazardOf(chosen), members });
    const routing = (chosen.priorityBreakdown as { routing?: unknown }).routing;
    const breakdown = { ...(p.breakdown as unknown as Record<string, unknown>), ...(routing ? { routing } : {}) };
    const r = await issueRepository.attachJoin(report.id, chosen.id, { priority: p.tier, score: p.score, breakdown });
    // If someone else joined at the same moment our member list was stale: re-derive from the real members.
    if (r.meTooCount !== ids.length) await refreshIssuePriority(chosen.id);
    const issue: Issue = { ...chosen, meTooCount: r.meTooCount, priority: p.tier, priorityScore: p.score };
    return { issue, joinedExisting: true, alreadyCounted: !r.joined };
  }

  // The DEPARTMENT is the AI's decision (validated by routeIssue); code keeps confidentiality, the place check and the safety net.
  const ai = confidential ? null : await aiDepartmentFor(report, ex, location);
  const route = routeIssue({ confidential, location, aiDepartment: ai?.department, injection: ai?.injection ?? ex.injection_attempt_detected, aiMode: ai?.mode ?? "fallback" });
  const members = weightsFromProfiles([report.userId], pre.reporterProfile ?? (await userRepository.trustProfiles([report.userId])));
  const p = computePriority({ category: ex.problem_category, hazard, members });
  const input = {
    canonicalLocation: location?.id ?? null,
    category: ex.problem_category,
    signature: ex.problem_signature,
    department: route.department,
    priority: p.tier,
    priorityScore: p.score,
    priorityBreakdown: { ...(p.breakdown as unknown as Record<string, unknown>), routing: { queue: route.queue, source: route.source, aiDepartment: ai?.department ?? null, reason: route.reason } },
    isConfidential: confidential,
    oneLineReason: explainRouting({ signature: ex.problem_signature, hazardType: hazard.isHazard ? hazard.type : null, location, department: route.department, confidential, source: route.source, aiMode: ai?.mode ?? "fallback" }),
  };
  const id = await issueRepository.attachNew(report.id, input);
  const now = new Date().toISOString();
  const issue: Issue = { id, ...input, status: "open", meTooCount: 1, resolutionRound: 0, createdAt: now, updatedAt: now, resolvedAt: null, voteDeadline: null };
  return { issue, joinedExisting: false, alreadyCounted: false };
}

/**
 * Run completeReport with a bounded retry. If it still fails the report stays SAVED and is marked "needs attention"
 * (the admin sees it with a Retry button), so a failure after saving never silently loses a report.
 * A retry first checks whether the earlier attempt actually attached the report (the answer may have been lost).
 */
async function completeSafely(report: Report, location: LocationRef | null, pre: Prefetched = {}): Promise<Outcome | null> {
  for (let attempt = 0; attempt <= config.reliability.autoRetries; attempt++) {
    try {
      if (attempt > 0) {
        const fresh = await reportRepository.getById(report.id);
        if (fresh?.issueId) {
          const issue = await issueRepository.getById(fresh.issueId);
          if (issue) return { issue, joinedExisting: fresh.status === "grouped", alreadyCounted: false };
        }
      }
      return await completeReport(report, location, pre);
    } catch (e) {
      if (e instanceof ServiceError) throw e;
      console.error("completeReport failed (attempt " + (attempt + 1) + "):", e instanceof Error ? e.message : "unknown");
    }
  }
  try {
    await reportRepository.markAttention(report.id, "issue_creation_failed");
  } catch {
    /* the admin "stuck reports" query still finds an unattached report even without the marker */
  }
  return null;
}

// The analysis is a pure function of the text (no identity goes in), so the second submit that answers a "where?" question
// reuses it instead of calling Gemini again. Kept in memory for a few minutes.
const ANALYSIS_TTL_MS = 10 * 60_000;
type AnalysisCache = Map<string, { at: number; analysis: AnalyzedReport }>;
const analysisCache = (): AnalysisCache => ((globalThis as { __rfAnalysisCache?: AnalysisCache }).__rfAnalysisCache ??= new Map());

/** Tests only: forget cached analyses so a test can count AI calls. */
export function clearAnalysisCache(): void {
  analysisCache().clear();
}

async function analyzeCached(text: string): Promise<AnalyzedReport> {
  const cache = analysisCache();
  const key = createHash("sha256").update(text).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ANALYSIS_TTL_MS) return hit.analysis;
  const analysis = await analyzeReport(text);
  cache.set(key, { at: Date.now(), analysis });
  if (cache.size > 200) for (const [k, v] of cache) if (Date.now() - v.at >= ANALYSIS_TTL_MS || cache.size > 200) cache.delete(k);
  return analysis;
}

function resolvedDecision(location: LocationRef, mention: string | null): LocationDecision {
  return { status: "resolved", location, reason: null, mention, question: null, suggestions: [] };
}

function followUpView(question: string): ReportView {
  return { id: "", status: "needs_problem", confidential: false, message: question, location: null, clarification: null, issue: null, followUp: { question } };
}

function confirmView(args: { problem: string; place: LocationRef | null; confidential: boolean }): ReportView {
  return {
    id: "",
    status: "needs_confirm",
    confidential: args.confidential,
    message: args.confidential ? "This will be handled confidentially. Send it?" : "Is this right? If yes, send it.",
    location: args.place ? ref(args.place) : null,
    clarification: null,
    issue: null,
    summary: { problem: args.problem, place: args.place ? { id: args.place.id, name: args.place.name } : null, confidential: args.confidential },
  };
}

export interface SubmitOptions {
  /** Check only: ask the counter-questions and show the summary, but do NOT save or route anything. */
  dryRun?: boolean;
  /** How many counter-questions the student has already answered for this report (bounds the "what is the problem?" loop). */
  followUpAnswers?: number;
  /** The optional department -> place picker. Only a hint (see rules/placeHint.ts). */
  hint?: PlaceHint | null;
  /** The student's explicit answer to a "where?" question (a place id). */
  choice?: string | null;
  /** The student TYPED the place in answer to a "where?" question. Checked like any place in a report (never guessed). */
  placeText?: string | null;
}

/** Submit a new report (students only). May answer with a question (status "needs_place") instead of saving. */
export async function ingestReport(user: User | null, rawText: string, opts: SubmitOptions = {}): Promise<ReportView> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  if (!canSubmitReport(user)) throw new ServiceError("forbidden", "Only students can submit reports.");

  let text: string;
  try {
    text = prepareReportText(rawText);
  } catch (e) {
    if (e instanceof EmptyReportError) throw new ServiceError("bad_request", "Please describe the problem.");
    throw e;
  }

  // Only the report text goes to the AI: no user id, name or trust (hard rule).
  const analysis: AnalyzedReport = await analyzeCached(text);
  const confidential = analysis.flags.confidential;
  // Counter-question 1: does the report say WHAT the problem is? The AI decides (problem_is_clear); a safety hazard or a
  // confidential report is never held back by it.
  if (!confidential && !analysis.flags.safetyHazard && analysis.extraction.problem_is_clear === false && (opts.followUpAnswers ?? 0) < config.clarification.maxFollowUps) {
    return followUpView(analysis.extraction.follow_up_question?.trim() || "What is the problem? For example: WiFi not working, AC not cooling, a broken projector.");
  }
  let decision: LocationDecision = decideLocation(analysis.extraction.raw_location_mention, text, { confidential });
  let placeSource: "text" | "picker" | "choice" | null = decision.status === "resolved" ? "text" : null;

  // The picker is a hint and the student's tap is an answer; neither applies to a confidential report (no place needed).
  if (!confidential) {
    const typed = opts.placeText ? sanitizeReportText(opts.placeText, 200) : "";
    if (typed && !opts.choice) {
      // A place name is not an instruction: anything that reads like one is never matched, so it cannot steer the place.
      const t = detectInjection(typed).detected ? null : decideLocation(typed, typed, { confidential: false });
      if (!t) {
        return placePromptView({ reason: "no_place", question: "Please type just the name of the place, for example IS Lab 2.", options: [] });
      }
      if (t.status !== "resolved" || !t.location) {
        return placePromptView({
          reason: t.reason === "no_location" ? "no_place" : "unknown_with_hint",
          question: t.question ?? `I couldn't find "${typed.slice(0, config.location.maxMentionChars)}" on campus. Please check the name or pick from the list.`,
          options: t.suggestions.slice(0, config.location.maxSuggestions).map((l) => ({ id: l.id, name: l.name, owner: l.owner })),
        });
      }
      decision = resolvedDecision(t.location, typed);
      placeSource = "choice";
    } else if (opts.choice) {
      const picked = getLocationById(opts.choice);
      if (!picked) throw new ServiceError("bad_request", "That place was not found.");
      decision = resolvedDecision(picked, decision.mention);
      placeSource = "choice";
    } else {
      const r = reconcilePlace(decision, opts.hint, false);
      if (r.kind === "ask") return placePromptView(r);
      if (r.kind === "resolved") {
        decision = resolvedDecision(r.location, decision.mention);
        placeSource = r.source;
      }
    }
  }

  if (opts.dryRun) {
    if (confidential) return confirmView({ problem: "", place: null, confidential: true });
    if (decision.status !== "resolved" || !decision.location) {
      // Counter-question 2: where? (never guessed; the student may type it or pick from the options)
      return placePromptView({
        reason: decision.reason === "no_location" ? "no_place" : "unknown_with_hint",
        question: decision.question ?? "Where is this problem?",
        options: decision.suggestions.slice(0, config.location.maxSuggestions).map((l) => ({ id: l.id, name: l.name, owner: l.owner })),
      });
    }
    return confirmView({ problem: (analysis.extraction.problem_signature || analysis.extraction.normalized_text_en).replace(/^./, (c) => c.toUpperCase()), place: decision.location, confidential: false });
  }

  const clarification = decision.status === "needs_clarification" ? startClarification(decision) : null;
  // The three database reads/writes below do not depend on each other: run them together (1 round trip, not 3).
  const [report, existing, reporterProfile] = await Promise.all([reportRepository.insert({
    userId: user.id,
    rawText: text,
    language: analysis.extraction.language,
    canonicalLocation: decision.location?.id ?? null,
    extracted: analysis.extraction,
    flags: {
      nets: analysis.flags,
      ai: { mode: analysis.mode, fallbackReason: analysis.fallbackReason ?? null },
      location: { mention: decision.mention, reason: decision.reason, status: decision.status, source: placeSource, hint: cleanHint(opts.hint).location?.id ?? cleanHint(opts.hint).department },
      ...(clarification ? { clarification } : {}),
    },
    aiMode: analysis.mode === "gemini" ? "gemini" : "fallback",
    isConfidential: confidential,
    status: clarification ? "needs_clarification" : "received",
  }),
    !clarification && !confidential && decision.location ? issueRepository.listGroupingCandidates(decision.location.id).catch(() => undefined) : Promise.resolve(undefined),
    clarification ? Promise.resolve(undefined) : userRepository.trustProfiles([user.id]).catch(() => undefined),
  ]);
  if (clarification) return toReportView(report);

  const outcome = await completeSafely(report, decision.location, { existing, reporterProfile });
  if (!outcome) return toReportView({ ...report, attention: "issue_creation_failed" });
  return toReportView({ ...report, status: outcome.joinedExisting ? "grouped" : "routed", issueId: outcome.issue.id }, outcome);
}

export async function listMyReports(user: User | null): Promise<ReportView[]> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  return (await reportRepository.listByUser(user.id)).map((r) => toReportView(r));
}

export interface ClarifyInput {
  reportId: string;
  /** Free-text answer ("EE lab 1", "networking lab ke andar"). */
  answer?: string;
  /** One of the offered suggestion ids (validated against the stored question). */
  locationId?: string;
}

/** The author answers the clarification question (max config.clarification.maxAnswers times). */
export async function answerClarification(user: User | null, input: ClarifyInput): Promise<ReportView> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  const report = await reportRepository.getById(input.reportId);
  // Same error for "missing" and "someone else's": do not reveal that other reports exist.
  if (!report || !canAnswerClarification(user, report)) throw new ServiceError("not_found", "Report not found.");

  const state = clarificationOf(report);
  if (report.status !== "needs_clarification" || !state) throw new ServiceError("conflict", "This report does not need clarification.");
  if (state.adminOnly || state.attempts >= state.maxAnswers) {
    throw new ServiceError("conflict", "The answer limit was reached; the admin will review this report.");
  }

  let result: Parameters<typeof applyAnswer>[2];
  let answerText: string;
  if (input.locationId) {
    if (!state.suggestionIds.includes(input.locationId)) throw new ServiceError("bad_request", "That place was not one of the options.");
    const picked = getLocationById(input.locationId);
    if (!picked) throw new ServiceError("bad_request", "Unknown place.");
    result = { picked };
    answerText = picked.name;
  } else {
    answerText = sanitizeReportText(input.answer ?? "", 200);
    if (!answerText) throw new ServiceError("bad_request", "Please tell me the place.");
    // The answer is data: try it as a place name, then try to find a place phrase inside it. No AI call.
    const tries = [answerText, extractLocationMention(answerText)].filter((m): m is string => !!m);
    const decisions = tries.map((m) => decideLocation(m, answerText, { confidential: false }));
    const decision = decisions.find((d) => d.status === "resolved") ?? decisions[0] ?? decideLocation(null, answerText, { confidential: false });
    result = { decision };
  }

  const outcome = applyAnswer(state, answerText, result);
  if (outcome.kind === "closed") throw new ServiceError("conflict", "The answer limit was reached.");

  const resolved = outcome.kind === "resolved";
  const updated = await reportRepository.updateClarification(report.id, state.attempts, {
    status: resolved ? "received" : "needs_clarification",
    canonicalLocation: resolved ? outcome.location.id : null,
    flags: { ...report.flags, clarification: outcome.state, location: { ...(report.flags.location as object), status: resolved ? "resolved" : "needs_clarification" } },
  });
  if (!updated) throw new ServiceError("conflict", "This report was just updated. Please refresh and try again.");
  if (!resolved) return toReportView(updated);

  const done = await completeSafely(updated, outcome.location);
  if (!done) return toReportView({ ...updated, attention: "issue_creation_failed" });
  return toReportView({ ...updated, status: done.joinedExisting ? "grouped" : "routed", issueId: done.issue.id }, done);
}

/** Admin picks the place for a report whose clarification limit was reached (admin-only queue). */
export async function adminAssignLocation(user: User | null, reportId: string, locationId: string): Promise<ReportView> {
  if (!isAdmin(user)) throw new ServiceError("forbidden", "Only the admin can do this.");
  const report = await reportRepository.getById(reportId);
  const state = report ? clarificationOf(report) : null;
  if (!report || report.isConfidential || report.status !== "needs_clarification" || !state?.adminOnly) {
    throw new ServiceError("not_found", "No such report waiting for admin review.");
  }
  const loc = getLocationById(locationId);
  if (!loc) throw new ServiceError("bad_request", "Unknown place.");
  const updated = await reportRepository.updateClarification(report.id, state.attempts, {
    status: "received",
    canonicalLocation: loc.id,
    flags: { ...report.flags, clarification: { ...state, history: [...state.history, { answer: `admin assigned ${loc.name}`, outcome: "resolved", at: new Date().toISOString() }] }, location: { ...(report.flags.location as object), status: "resolved" } },
  });
  if (!updated) throw new ServiceError("conflict", "This report was just updated.");
  const done = await completeSafely(updated, loc);
  if (!done) return toReportView({ ...updated, attention: "issue_creation_failed" });
  return toReportView({ ...updated, status: done.joinedExisting ? "grouped" : "routed", issueId: done.issue.id }, done);
}

/** Admin retries a saved report that never got an issue ("needs attention"). Confidential reports are retried without being shown. */
export async function adminRetryReport(user: User | null, reportId: string): Promise<ReportView> {
  if (!isAdmin(user)) throw new ServiceError("forbidden", "Only the admin can do this.");
  const report = await reportRepository.getById(reportId);
  if (!report || report.issueId || report.status !== "received") throw new ServiceError("not_found", "No such report waiting for a retry.");
  const location = report.canonicalLocation ? getLocationById(report.canonicalLocation) : null;
  if (!report.isConfidential && !location) throw new ServiceError("conflict", "This report has no place yet; assign one first.");
  let outcome: Outcome;
  try {
    outcome = await completeReport(report, location);
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    throw new ServiceError("unavailable", "The retry failed. Please try again in a moment.");
  }
  await reportRepository.markAttention(report.id, null).catch(() => {});
  return toReportView({ ...report, status: outcome.joinedExisting ? "grouped" : "routed", issueId: outcome.issue.id, attention: null }, outcome);
}
