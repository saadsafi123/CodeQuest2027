# Setup (beginner friendly)

You need Node.js 20+ and a browser. The app works without Gemini keys (fallback mode) but needs Supabase.

## 1. Install
```
npm install
```

## 2. Create the Supabase project
1. Go to https://supabase.com, sign in, click **New project**. Pick a name and a database password (save it; you will not need it in the app).
2. Wait until the project finishes provisioning.

## 3. Create the tables
1. In the Supabase dashboard open **SQL Editor -> New query**.
2. Open `src/lib/db/schema.sql` in your editor, copy ALL of it, paste it into the SQL editor, click **Run**.
3. You should see "Success. No rows returned". It is safe to run again later.

> Set the project up before phase 2 or 5-7? Paste the updated `schema.sql` again (safe to repeat). It adds the issue, voting, trust and read functions and a few columns. `npm run db:check` says "schema is older than the app" until you do.

## 4. Get the URL and service_role key
Dashboard -> **Project Settings -> API**:
- **Project URL** -> `SUPABASE_URL`
- **service_role** key (under "Project API keys", click Reveal) -> `SUPABASE_SERVICE_ROLE_KEY`
Never use the `anon` key and never share the service_role key.

## 5. (Optional) Gemini keys
Go to https://aistudio.google.com/apikey. Quotas are per Google Cloud PROJECT, so create each key in a **different project** (use "Create API key in new project"). Put them comma-separated in `GEMINI_API_KEYS`. Skip this step to run in fallback mode.

## 6. Fill `.env.local`
```
copy .env.example .env.local      (Windows)   |   cp .env.example .env.local   (Mac/Linux)
```
Edit `.env.local` and fill in the values. Keep `AI_MODE=auto`. Run `npm run ai:probe` to see which models your keys can use and put the recommended `GEMINI_MODELS=...` line in `.env.local` (ordered list, tried first model first; `GEMINI_MODEL` is the single-model fallback).

## 7. Check and seed
```
npm run db:check     # prints what to fix, or OK
npm run db:reset     # wipes and loads the demo users
```

## 8. Run
```
npm run dev
```
Open http://localhost:3000. The banner at the top shows AI mode (Gemini keys or fallback) and database status. Use `/judge` for the judge actions: switch user, create student, reset all data.

## Troubleshooting
| Banner / message | Fix |
|---|---|
| Database: NOT CONFIGURED | `.env.local` missing or values empty; restart `npm run dev` after editing it |
| Database: SCHEMA MISSING | Run `schema.sql` in the SQL editor (step 3) |
| Database: UNREACHABLE | Check internet, URL typo, or **project paused** (free projects pause when idle: click Restore in the dashboard) |
| AI: FALLBACK mode | No Gemini keys, all keys rate-limited/invalid, or `AI_MODE=fallback`. Fine for the demo |

## Voting window for demos
By default a resolution round lasts 48 hours. Add `VOTING_WINDOW_MODE=demo` to `.env.local` for a 2-minute window (restart the server).

## Useful commands
| Command | What it does |
|---|---|
| `npm run ai:probe` | tests every Gemini key against candidate models and recommends `GEMINI_MODELS` |
| `npm run perf` | times the main service calls and counts database round trips (wipes and reseeds demo data) |
| `npm run live:community` | runs the voting / trust / flag / confidentiality flow against the live database (wipes and reseeds demo data; set `AI_MODE=fallback` for a deterministic run) |
