# UI redesign: handoff (read this first in a new chat)

Branch: `ui-redesign` (rollback: `git checkout master`, snapshot commit `c517c91`). Plan: `docs/UI_PLAN.md`. Audit: `docs/UI_AUDIT.md`. Decision: D74 in `docs/DECISIONS.md`.

## Standing rules from the user
- UI only. Do NOT change business logic, services, rules, permissions, security, confidentiality, DB schema or API behaviour.
- Commit locally on `ui-redesign`, small commits per step. NEVER push. Never commit keys or `.env.local`.
- Phase 8 (bonus) is paused until the user says "go".
- Work fast, keep replies short. During building run only targeted tests; run full tests + lint + build once at the end of a step. Screenshots once per step at 1440x900 and 390x844.
- On Windows run `npm test` from PowerShell. Use the Write tool (not Bash heredocs) for files with apostrophes or quotes.
- `cn()` has no tailwind-merge: conflicting classes do not override each other, use variants.

## Direction (institutional, quiet, trustworthy)
Brand #12355B, page #F5F7FA, flat 1px hairlines, radii 4-8px, no gradients, no shadows except menus/modals, Inter for UI, serif only for page titles and the university name, sentence case. Colour values live ONLY in `src/app/globals.css`. Identity text only in `src/lib/brand.ts` (university "MCS, NUST", team "Sixth Sense"). Status/priority words and classes only in `src/lib/labels.ts`. Role is shown once (account menu).
Guards: `tests/unit/contrast.test.ts` (WCAG) and `tests/unit/uiGuard.test.ts` (no colour literals outside globals.css; the NOT_MIGRATED list must shrink to empty).

## Done (checkpoint approved path: tokens, components, shell, student dashboard)
- Tokens, fonts, labels, date helpers, guards.
- `src/components/ui` flattened; new Breadcrumbs, PageHeader (with crumbs), SummaryStrip.
- Shell: header with crest + university name, collapsible sidebar (drawer on phones), no top utility bar, big footer on the landing page only, slim footer elsewhere with "Made by Team Sixth Sense", judge tools as an edge-docked tab, `/how-decisions-are-made` and `/privacy` pages.
- Student dashboard (`MyIssuesTable`), staff queue defaults to list view.

## Next (rollout order, one commit per page)
1. Landing (light, plain headline "Report a campus problem", 4-step row, department list, fair-by-design text, one campus SVG; full footer lives here).
2. New report page: calm guided form, EXCELLENT on phone (judges may test on mobile).
3. Issue detail (vertical timeline, voting panel, weight breakdown), 4. Staff queue/detail, 5. Admin (+ confidential, trust ledger as a table), 6. Trust pages, 7. Judge page, 8. States/accessibility/responsive passes.
Then: remove legacy colour aliases in globals.css and the rf-* helpers, empty NOT_MIGRATED, delete unused illustrations/design gallery, grep proves no hex/rgb/hsl outside globals.css, no console/hydration errors, after-screenshots of every route in `docs/ui-shots/after/` (`ONLY=<regex> PUPPETEER_CORE=<path> node scripts/ui-shots.cjs after <baseUrl>`), final summary.

## Still placeholders
Address, phone, email, hours in `src/lib/brand.ts`; privacy text in `/privacy`.
