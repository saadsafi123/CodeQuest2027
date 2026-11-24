# ReportFix

Campus issue-reporting platform (CodeQuest 2026). Students report problems; AI understands the text; deterministic code routes, prioritizes, groups, and protects; students confirm or dispute fixes with trust-weighted votes.

- Setup: [docs/SETUP.md](docs/SETUP.md)
- Project rules and conventions: [CLAUDE.md](CLAUDE.md)
- Docs: [docs/](docs/)

Quick start: `npm install`, copy `.env.example` to `.env.local`, apply `src/lib/db/schema.sql` in the Supabase SQL editor, `npm run db:check`, `npm run db:reset`, `npm run dev`.
