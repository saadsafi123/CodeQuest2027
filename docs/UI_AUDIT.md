# UI audit (before the institutional redesign)

Sources: 38 screenshots in `docs/ui-shots/before/` (public, Student, Staff, Admin, /judge at 1440 and 390) and `docs/UI_LIVE_TEST_REPORT.md` (visible-browser walkthrough). Ranked by impact on a first impression.

## Cross-cutting (affects every page)
1. **Wrong visual register.** Dark gradient hero (landing, student home), cream/beige page background, coloured top borders on tiles, pill badges and fully rounded cards, soft shadows everywhere. Reads as a startup template, not an official portal.
2. **Colour system is ad hoc.** About 300 uses of an old scale (`brand-50..900`, `warn`, `ok`, `info`, `accent`), 24 colour literals in 11 files, two gradients in `globals.css`, `bg-white`/`text-white` in 10 files. No semantic tokens, no contrast check.
3. **Typography.** Plus Jakarta Sans at 15px renders with tight word gaps ("Everyproblem you reported orjoined"); computed `letter-spacing` and `word-spacing` are normal, so the font is the cause. Serif is used for every heading and for stat numbers. Small all-caps labels.
4. **Role repeated 3x** (sidebar chip, top-bar chip, hero), plus a slogan ("AI understands, code decides") in the sidebar that means nothing to a student.
5. **No institutional frame.** No utility bar, no university identity, no breadcrumbs, thin footer without address, directory or privacy links.
6. **Floating "Judge tools" pill covers content** on every page, especially phones; the Next.js dev badge covers the sidebar footer.
7. **Jargon and unexplained abbreviations** on screen ("Sent to CSE", "Round 1", "Early close progress", "trust", "Needs department", "Awaiting place"). Raw status words in timelines ("open → in progress"). Mixed time formats.
8. **Big tile cards instead of dense, scannable tables** on student, staff and admin pages.

## Per page
| Page | Problems (most important first) |
|---|---|
| Landing `/` | Dark gradient hero with floating mock card and overlapping pills; startup slogan; no department directory; "Judge tools" visible to everyone. |
| Sign in / Sign up | Fine structurally; styled as cards with big icon tiles; copy is friendly but not institutional. |
| Student `/student` | Gradient hero, role repeated, trust ring as a hero element, tile cards; issues as cards (no columns for department/priority/updated, no search or tabs); alert for votes not table-integrated. |
| New report | Good flow; page width and stepper heavy; result view repeats priority twice and does not explain CSE; duplicate toast + inline error; double-click can create two reports. |
| Issue detail | Stale panel right after a vote that closes the issue; maths-style voting text; serif headings inside cards; card-in-card nesting. |
| Staff `/staff` | Four tiles plus a priority board in cards; table view is secondary; critical banner is good but loud (pulse animation). |
| Admin `/admin` | Six tiles with sparklines; empty state wrong when the default "Active" tab hides closed issues; cryptic tile names. |
| Confidential, Trust | Same card styling; trust ledger needs a real event table with labelled deltas. |
| Judge | Works, but the dock overlaps content and `/judge` repeats the user cards. |
| Notifications | Fine; bell dropdown clipped on small widths. |

## What is already good (keep)
Behaviour and guards (all pages `requireRole`, server-side permissions), plain error and not-found pages, InfoTips and `helpCopy.ts`, live trust, loading skeletons, no horizontal scroll at 390/360, escaped user text (no XSS).
