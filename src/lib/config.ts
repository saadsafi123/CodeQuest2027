// Purpose: THE ONE PLACE for every tunable number/threshold in ReportFix. Change values here, nowhere else.
// Pure constants (no server-only import) so tests and client code can read them.
// Items marked [later] are decided but consumed by features not built yet.

export const config = {
  /** Report text handling. */
  report: {
    maxChars: 2000,
  },

  /** AI layer / Gemini key pool. */
  ai: {
    callTimeoutMs: 5_000, // one Gemini call; busy models can hang for 30s+, so give up and rotate
    totalBudgetMs: 9_000, // all attempts for one AI task; after this the rules fallback takes over
    defaultCooldownMs: 60_000, // used when a 429 carries no retry delay
    extraAttemptsOverKeyCount: 2, // attempt cap = number of keys + this
    transientBackoffBaseMs: 250,
    modelFailStreakToCooldown: 2, // consecutive transient failures (503 / timeout) before a model is skipped ...
    modelCooldownMs: 20_000, // ... for this long, for every key (circuit breaker: later reports go to the next model or the rules fallback at once)
  },

  /** Priority tiers, lowest to highest. Only code may set these; any safety hazard is forced to "critical". */
  priority: {
    tiers: ["low", "medium", "high", "critical"] as const,
    safetyForcesTier: "critical" as const,
    /** Starting severity by problem category, BEFORE crowd. Only a safety hazard may reach "critical". */
    categoryBase: {
      network: "medium",
      electrical: "medium",
      hvac: "low",
      equipment: "medium",
      plumbing: "medium",
      cleanliness: "low",
      furniture: "low",
      food: "low",
      library_service: "low",
      safety: "high",
      harassment: "high",
      other: "low",
    } as Record<string, "low" | "medium" | "high" | "critical">,
    /** Crowd score needed for +1, +2 tiers. */
    crowdLevelThresholds: [2.5, 4.5] as readonly number[],
    /** Crowd alone can never lift a non-hazard issue above this tier. */
    crowdMaxTier: "high" as const,
  },

  /** Crowd importance. One person's weight is capped so one high-trust student can never lift a low-severity issue above medium. */
  crowd: {
    perPersonWeightCap: 1.0,
    diminishingExponent: 0.5, // contribution of the n-th person is scaled by 1 / n^exponent
    singleUserMaxTierForLowSeverity: "medium" as const,
  },

  /** [later] Trust ledger. Base 50, clamped 0-100, everything logged in trust_events. */
  trust: {
    base: 50,
    min: 0,
    max: 100,
    weightOffset: 0.5, // weight = weightOffset + trust / weightTrustDivisor
    weightTrustDivisor: 100,
    newAccountMaxAgeHours: 24, // younger than this -> weight capped
    newAccountMinLedgerEvents: 3, // fewer ledger events than this -> weight capped
    newAccountWeightCap: 0.5,
    deltas: {
      reportConfirmedOrValidated: +3,
      voteMatchesFinalOutcome: +1,
      reportFlaggedSpamOrFake: -10,
      abuse: -15,
    },
  },

  /**
   * Resolution voting. The "pool" of a round = the affected students who had joined when staff marked the issue resolved
   * (late joiners can still join the issue, but they are not in that round's pool). Weights are frozen at that moment.
   */
  voting: {
    // --- reopen: needs ALL of these
    disputeWeightShareToReopen: 0.5, // dispute weight >= this share of the weight cast ...
    minDistinctDisputers: 2, // ... AND at least this many distinct disputers (1 if the pool has a single student)
    minDistinctDisputersSingleMember: 1,
    /** ... AND the disputers' combined weight >= this, so two brand-new accounts (0.5 + 0.5) alone cannot reopen.
     *  If the whole pool weighs less than this (e.g. only new accounts are affected) the pool's total weight is the minimum. */
    minDisputeWeightToReopen: 1.2,
    // --- early close: confirmations reach a trust-weighted majority of the whole pool
    earlyCloseConfirmShare: 0.5, // confirm weight must be MORE than this share of the pool's total weight ...
    minDistinctConfirmers: 2, // ... AND at least this many distinct confirmers (1 if the pool has a single student)
    minDistinctConfirmersSingleMember: 1,
    // --- window: an issue with no reopen closes by itself when the window ends
    windowHours: 48, // normal window per resolution round
    demoWindowMinutes: 2, // short window for demos: set VOTING_WINDOW_MODE=demo in .env.local
  },

  /** Database. A hung Supabase request is abandoned after this long (the user sees a friendly "try again"). */
  db: {
    requestTimeoutMs: 10_000,
  },

  /** Half-finished reports: a saved report that never got an issue is surfaced to the admin. */
  reliability: {
    stuckReportAfterMs: 120_000, // a report unattached this long is shown under "needs attention"
    autoRetries: 1, // immediate retries of issue creation before giving up and flagging the report
  },

  /** Trending board (bonus). Score = (priority points + crowdFactor * sqrt(distinct students)) * recency; recency halves every halfLifeHours. */
  trending: {
    limit: 8,
    halfLifeHours: 36,
    priorityPoints: { low: 1, medium: 2, high: 3, critical: 4 } as Record<string, number>,
    crowdFactor: 1.5,
    /** A report is "rising" when it is this new and already has this many affected students. */
    risingMaxAgeHours: 24,
    risingMinStudents: 2,
  },

  /** AI-written admin summary (bonus). Cached so a page refresh does not call the AI every time. */
  summary: {
    cacheSeconds: 90,
    topIssues: 8,
  },

  /** Grouping ("me too"). */
  grouping: {
    maxCandidates: 8, // existing issues at the same place offered to the same-problem check
  },

  /** Location matching. */
  location: {
    maxSuggestions: 4, // options offered in a clarification question
    maxLabSuggestions: 8, // a bare "lab" lists every lab (each department has its own)
    fuzzyOneTypoMinLen: 5, // location words this long tolerate 1 typo
    fuzzyTwoTypoMinLen: 9, // ... and this long tolerate 2 (numbers are always exact)
    maxMentionChars: 80, // mention is truncated before it is echoed back in a question
  },

  /** Unknown-location clarification: the student may answer this many times, then it is admin-only. */
  clarification: {
    maxAnswers: 2,
    /** Counter-questions the AI may ask about WHAT the problem is, before the report goes through as it is (no endless loop). */
    maxFollowUps: 3,
  },
} as const;

/** Length of one voting window in seconds. VOTING_WINDOW_MODE=demo switches to the short demo window (server only). */
export function votingWindowSeconds(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): number {
  return (env.VOTING_WINDOW_MODE ?? "").trim().toLowerCase() === "demo" ? config.voting.demoWindowMinutes * 60 : config.voting.windowHours * 3600;
}

export type PriorityTier = (typeof config.priority.tiers)[number];
