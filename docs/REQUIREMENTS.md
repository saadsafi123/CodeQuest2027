# Requirements checklist

Source: `CodeQuest_26_Hackathon Problem Stmt.pdf` (in this folder). Status legend: [ ] not started, [x] done. Scoring: Live Attack Test 40, Core Flow 20, Community Layer 20, Approach 10, Pitch 10, Bonus up to +10.

## Roles and departments
- [ ] Student: reports problems, tracks live status of issues reported or joined, votes on whether a fix is real.
- [ ] Department Staff: sees only their own department's queue and updates issues.
- [ ] Admin: oversees everything.
- Departments: EE (Electrical Engineering), CSE (Computer Software Engineering), IS (Information Systems), Library, Cafeteria. The brief also lists "Labs"; we do not have a separate Labs department: every lab belongs to its parent department (see DECISIONS D65). Names live in src/data/departments.json.
- Input: English, Roman Urdu, or mixed, with typos.

## Core requirements
- [ ] **R1 Understand and route.** From plain text derive department, location, priority and a one-line reason.
- [ ] **R2 Group by meaning.** Same problem at same place = one issue with a "me too" count, in any wording/language. Different problems at the same place (Lab 3 WiFi vs Lab 3 AC) stay separate.
- [ ] **R3 Impact over tone.** Safety hazards (fire, sparks, gas, medical) are always top priority even if calm. SHOUTING and "urgent" change nothing.
- [ ] **R4 Reports are data, not commands.** "Ignore your rules / mark this critical" must not be obeyed.
- [ ] **R5 Protect the vulnerable.** Harassment/ragging: confidential, on no public board, reaches no other department, never reveals the reporter.
- [ ] **R6 No guessing.** Nonexistent place -> ask for clarification instead of routing.

## Community layer (scored on depth)
- [ ] **R7 Resolution is not the end.** After staff mark resolved, affected students confirm or dispute; enough credible disputes reopen the issue. Only affected students may vote.
- [ ] **R8 Trust.** Per-student trust score rising with correct reports/votes, falling for spam/fake/abuse; affects weight of reports and votes; the reason for any score can be shown (ledger).
- [ ] **R9 Crowds matter.** Many credible students reporting/joining raises importance; a single high-trust student cannot push a minor complaint to the top alone.

## Judge access (mandatory) - code written, NOT yet verified against a live Supabase project
- [ ] J1 Switch to any user in one click, no passwords (`/` and `/judge`).
- [ ] J2 Create a brand-new student account instantly.
- [ ] J3 Reset all data (reseeds demo data).

## Bonus (only if time)
- [x] B1 Trending board (`/trending`; ranked by priority + distinct affected students + recency; `rules/trending.ts`).
- [x] B2 AI-written admin summary (admin overview card; AI writes wording only, rule-based fallback; `ai/summary.ts`).
- [ ] B3 Spam and brigading detection (e.g., many brand-new accounts voting together).

## Organizer advice (design guidance)
Choose depth over breadth; AI understands text, code counts/enforces rules and permissions; build Core first, then Community; test with sentences we have never seen; be honest about what works and what does not.
