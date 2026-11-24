// Purpose: `npm run db:reset` - wipe all data (reset_all_data) then reseed demo data.
import { resetAllData } from "@/lib/services/adminService";

resetAllData()
  .then((r) => {
    console.log(`Database reset and reseeded (${r.users} demo users, ${r.issues} demo issues).`);
    if (r.skipped.length) console.log("Skipped demo steps:\n  " + r.skipped.join("\n  "));
  })
  .catch((e) => {
    console.error(`Reset failed: ${e instanceof Error ? e.message : e}\nRun "npm run db:check" to see what to fix.`);
    process.exitCode = 1;
  });
