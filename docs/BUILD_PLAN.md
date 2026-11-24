# Build plan

Source of truth: the brief (`CodeQuest_26_Hackathon Problem Stmt.pdf`). Requirement ids R1-R9 and J1-J3 are in `REQUIREMENTS.md`. Scoring: Live Attack Test 40, Core Flow 20, Community 20, Approach 10, Pitch 10, Bonus +10.
Work happens in phases; each ends with the full suite (`npm run test`), `npm run lint`, `npm run build` and a live-DB check, then stops for review.

Status: **Setup, extraction + nets, stabilization, Phases 1-7 are done and verified (tests, lint, build, live Supabase, real-browser click-through). Phase 8 (bonus) is skipped until you say go.**

Order rationale: the 40-point live attack test hits Core rules (R1-R6) hardest, so those come first; the community layer builds on issues and members, so grouping comes before voting. I kept your order. One change: the adversarial suite (phase 7) is not left to the end. Every phase adds its own adversarial cases to `tests/scenarios/`; phase 7 is the consolidated, cross-feature pass.

---

## Phase 1: Location canonicalization + clarification (R6) - DONE
**Built:** gazetteer with real labs and ownership; `rules/location.ts` (typo / Roman Urdu / glued-digit matching, ambiguity, vague, unknown, never-guess); `rules/clarification.ts` (2 answers then admin-only); reportService `ingestReport` / `answerClarification` (stores the report, no routing yet); `POST/GET /api/reports`, `POST /api/clarify`; seed users backdated with ledger history.
**Acceptance:** nonexistent place asks instead of routing (R6); ambiguous/vague asks with options; real labs resolve from any spelling to the owning department (D13); only the author answers; 2 failed answers -> admin-only; confidential reports never block on location (R5).
**Tests:** `unit/location`, `unit/clarification` (incl. service with in-memory repo), `scenarios/location` in fallback and mocked-AI modes; live API run against Supabase.

## Phase 2: Report service, routing, confidential flow, priority scoring (R1, R3, R4, R5) - DONE
**Build:**
- `rules/priority.ts`: deterministic tiers critical/high/medium/low from category, safety (forced critical), affected count; ignores caps, "!", "urgent". Writes `priority_breakdown` (explainable).
- Routing: department = owner of the resolved location (D13); no owner (Main Gate, Parking) -> decision D28 below.
- `create_report_with_issue` RPC (atomic: report + issue + reporter member + audit), then `ingestReport` continues past location into issue creation. Reports that finished clarification continue the same path.
- Confidential flow: issue flagged confidential, department null, never in any department/public query; repositories filter it; admin sees "Anonymous reporter" (`rules/confidentiality.ts`).
- Injection stays flag-only; the flag is stored for staff/admin.
**Acceptance:** R1 (department, location, priority, one-line reason shown), R3 (calm fire = critical; SHOUTING/"urgent" = same tier as calm), R4 (injected text changes nothing), R5 (harassment on no public/department list, reporter hidden even from admin queue).
**Tests:** priority table tests (tone invariance, hazard floor, injection no-op); routing by owner; RPC atomicity (report+issue created together or not at all) on live DB; confidentiality repository tests (department/public queries never return confidential rows); scenario suite from `adversarial.ts` through the full pipeline.

## Phase 3: Grouping / "me too" (R2) - DONE
**Build:** `rules/grouping.ts` + `ai/compare.ts`: candidate issues = same canonical location, open (not closed), non-confidential, same department; semantic same-problem verdict from Gemini (strict JSON), with a deterministic fallback (signature/category/keyword overlap) when AI is unavailable. Match -> `join_issue_with_report` RPC (me_too_count, member as "joined", priority recomputed). Different problem at the same place -> new issue. Confidential reports are never grouped (D19).
**Acceptance:** same problem, any wording/language, same place = one issue with a me-too count; Lab WiFi vs Lab AC stay separate; one student cannot inflate the count (unique member per issue).
**Tests:** compare mocked-AI verdict handling (invalid output -> fallback rule); wording matrix (English / Roman Urdu / mixed / typos) must group; WiFi vs AC must not; same student twice counts once; concurrent joins on live DB; groups survive across AI modes (D27).

## Phase 4: Staff and admin dashboards, status updates, student issue page (R1, role model) - DONE
**Build:** `/staff` (own department queue only, sorted by priority, status actions open -> in_progress -> resolved with note), `/admin` (all non-confidential issues + filters), `/admin/confidential` (anonymous), `/student` (my issues + live status), `/student/new-report` (submit + clarification Q&A UI with option buttons), `/student/issue/[id]` (status history, join "me too"). `issue_updates` history; `rules/permissions.ts` for every role check.
**Acceptance:** staff cannot see other departments' issues or any confidential issue (API and UI); students see only issues they reported/joined; status changes are recorded with actor and note.
**Tests:** permission matrix (student/staff/admin x endpoints); URL-guessing (staff opens another department's issue id -> 404); status transition validity; UI smoke through the dev server on live DB.

## Phase 5: Resolution voting, dispute threshold, reopen (R7) - DONE
**Build:** staff marks resolved -> `resolution_round` bump, voting opens for members only; `rules/voting.ts` (D16: weighted dispute share >= 50% and >= 2 distinct disputers, or 1 if a single member); `cast_resolution_vote` RPC (atomic: vote, tally, reopen + issue_update, trust events). Joining stays open after resolution, only joined people vote (D15). Re-resolve starts a new round.
**Acceptance:** only affected students vote; one vote per round; enough credible disputes reopen; a lone dispute from a multi-member issue does not; confirm path closes the issue.
**Tests:** threshold boundary table (49%/50%, 1 vs 2 disputers, single-member issue); non-member vote rejected; duplicate vote rejected; reopen then re-resolve round; concurrent votes on live DB.

## Phase 6: Trust ledger, explainer page, crowd priority with anti-dominance (R8, R9) - DONE
**Build:** `rules/trust.ts` (D17 weights, new-account cap, deltas, clamp); `apply_trust_event` RPC; events fired from confirmed reports, matching votes, staff/admin spam/fake flags (only owning-department staff or admin) and abuse; `/admin/trust/[userId]` + `TrustBreakdown` (score = 50 + ledger, each event with reason); crowd priority in `priority.ts` (distinct affected students, trust-weighted sum, diminishing returns, per-person cap; D18).
**Acceptance:** any score is explainable from the ledger and rebuilds exactly; one high-trust student cannot raise a low-severity issue above medium; many credible students raise importance; new accounts voting together stay capped.
**Tests:** ledger rebuild property test; weight formula table incl. the 24h / 3-event cap; single-high-trust vs crowd scenarios; flag permission tests; live DB `user_trust_rebuilt` has zero mismatches after a full scenario.

## Phase 7: Full adversarial scenario suite - DONE
**Build:** consolidate `docs/TEST_PLAN.md` (20 scenarios) into `tests/scenarios/` through the real pipeline, in fallback mode, mocked-AI mode and (manual script) live Gemini; add fresh sentences nobody wrote the rules for; fix whatever breaks; judge-access end-to-end script (switch, create student, reset twice).
**Acceptance:** every row of TEST_PLAN passes; known limitations written down honestly (pitch advice: "be straight about what works").
**Tests:** that suite; a regression list of every bug found.

## Phase 8: Bonus (only if time)
Trending board (recent me-too velocity, non-confidential only), AI-written admin summary (input = aggregate, non-confidential data only, fallback = templated text), brigading detection (burst of new accounts voting/joining together -> weight discount and an admin flag).
**Acceptance:** each bonus is read-only or weight-reducing, never leaks confidential data, and degrades gracefully without Gemini.
**Tests:** confidentiality leak test on the summary input; brigading burst scenario; fallback summary.

---

## Delivered in phases 2-4 (DECISIONS D40-D52)
Design system + app shell; landing and judge pages; student form with inline clarification, dashboard, issue detail; staff queue; admin overview, confidential queue, place assignment; priority, routing, grouping, status updates, confidential flow; 271 unit/scenario tests; a real-browser click-through (19 checks) against the live DB.

## Open items (decided, listed for review)
- D28 (proposed): places with no owning department (Main Gate, Parking) are routed to the admin queue until a department is named. Say so if you prefer a default department.
- The gazetteer still has invented buildings/rooms (flagged `source: placeholder`); replace before the live attack test.
- "SE" labs were mapped to CSE (see DECISIONS D29): please confirm.

## Delivered in stabilization and phases 5-7 (DECISIONS D53-D64)
- **Stabilization:** `npm run ai:probe` (key x model table + recommendation); the key pool rotates keys AND an ordered model list (`GEMINI_MODELS`), disables a 404 per model only, and has a circuit breaker and a total time budget; `npm run perf` profiles the services against the live database; one-call page reads, a short user cache and parallel prefetch cut round trips; a saved report that fails to become an issue is retried and then shown to the admin ("Needs attention") instead of being lost.
- **Phase 5:** voting for affected students only, one vote per round, trust-weighted dispute rule, reopen and re-resolve rounds, live tallies, dashboard notices, and the real "Is it really fixed?" panel.
- **Phase 6:** every trust change is a ledger row with a plain reason (validated +3, vote matched +1, spam/fake -10, abuse -15), staff/admin flagging of reports, the explainer pages (student and admin), crowd priority recomputed on join, vote and flag.
- **Phase 7:** `tests/scenarios/community.test.ts`, `adversarial.test.ts`, `resilience.test.ts`, `tests/unit/voting.test.ts`, `security.test.ts`; `npm run live:community` runs the community flow against the live database. The adversarial pass found and fixed five bugs (D63).

## Delivered in the fixes-and-clarity pass (DECISIONS D65-D72)
No separate Labs department (labs belong to their parent department) and one source for department names; the optional department -> place picker as a hint with "ask before saving"; the top-bar trust score read from the ledger (cause and fix in D68); the new closing rules (pool, 48 h window with a 2-minute demo mode, early close, automatic close on read, Close now, late joiners); the minimum dispute weight (1.2); `docs/HOW_IT_WORKS.md` and `docs/PITCH_NOTES.md`; lint warning fixed.

## Open items for review
- Schema: every change needs `src/lib/db/schema.sql` pasted into the Supabase SQL editor again (safe to repeat). `npm run db:check` tells you when the database is older than the app.
- Set `GEMINI_MODELS` in `.env.local` (see `npm run ai:probe`); `.env.local` is never edited by the tools.
- Weak spots are listed in D64.
