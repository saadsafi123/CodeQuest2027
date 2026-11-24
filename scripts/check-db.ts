// Purpose: `npm run db:check` - verifies env vars, connection, tables and SQL functions; prints what to fix.
import { checkDatabase } from "@/lib/db/check";

async function main() {
  const r = await checkDatabase();
  if (r.ok) {
    console.log(`OK  ${r.message}`);
    return;
  }
  console.error(`PROBLEM  [${r.state}] ${r.message}`);
  r.fixes.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
  process.exitCode = 1;
}
main();
