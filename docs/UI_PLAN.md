# UI redesign plan: "Institutional, quiet, trustworthy" (D74)

Branch `ui-redesign`; rollback: `git checkout master` (snapshot `c517c91`). UI only: services, rules, DB, permissions and API behaviour are untouched.

## Steps (a small commit after each; checkpoint after step 5)
1. **Docs** (this file, `UI_AUDIT.md`).
2. **Tokens, typography, status colours, guards.** `globals.css` becomes the only place with colour values (semantic variables, Tailwind aliases). Inter + Source Serif 4 via `next/font`; no negative tracking; type scale 12/14/16/20/24/32. `src/lib/brand.ts`, `src/lib/labels.ts`, date helpers. Tests: WCAG contrast of every token pair; literal guard (allowlist shrinks as pages migrate). `devIndicators: false`.
3. **UI components** (`src/components/ui`): flat and precise (1px borders, 4-8px radii, shadows only for menus/modals/sticky), new `Breadcrumbs`, `PageHeader`, `SummaryStrip`; restyled Badge/Button/Card/Form/Table/Tabs/Alert/Modal/Toast/InfoTip/EmptyState/Skeleton.
4. **App shell**: utility bar, header (crest mark, university name, service name, bell, user menu with switcher, role shown once), collapsible sidebar (drawer on mobile), footer (address, department directory, help, privacy, "How decisions are made"), Judge tools as an edge-docked tab.
5. **Student dashboard** (title row, trust chip, pending alert, summary strip, filter tabs + search + table, stacked rows on phones). **Checkpoint: before/after screenshots at 1440 and 390; wait for approval.**
6. After approval: landing, new report (mobile-first), issue detail, staff, admin, confidential, trust ledger table, judge; then loading/empty/error states, accessibility and responsive passes; remove legacy colour aliases and unused code.
7. Finalize: grep proves no colour literals outside `globals.css`; contrast test green; no console/hydration errors; after-shots of every route in `docs/ui-shots/after/`.

## Decisions (defaults)
- Placeholder university identity in `src/lib/brand.ts`; service name "Issue Reporting & Resolution".
- The manual "me too" picker is not built (UI-only constraint); the result screen states when a report joined an existing issue.
- Status `closed` is labelled "Closed"; "Confirmed" stays the 4th progress step.
- Until step 6 finishes, legacy colour names stay as temporary aliases to the new palette so un-migrated pages remain legible.
