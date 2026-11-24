// Purpose: `npm run db:seed` - insert the demo users (idempotent upsert).
import { seedDemoData } from "@/lib/db/seed";

seedDemoData()
  .then((r) => console.log(`Seeded ${r.users} demo users.`))
  .catch((e) => {
    console.error(`Seed failed: ${e instanceof Error ? e.message : e}\nRun "npm run db:check" to see what to fix.`);
    process.exitCode = 1;
  });
