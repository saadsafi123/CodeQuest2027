// Purpose: judge/admin housekeeping: reset all data and reseed the demo data.
import "server-only";
import { systemRepository } from "@/lib/db/repositories";
import { seedDemoData, type SeedResult } from "@/lib/db/seed";
import { invalidateUser } from "./userService";

/** Wipe everything and reseed. `withStory: false` = users only (scripts that need a clean slate). */
export async function resetAllData(opts: { withStory?: boolean } = {}): Promise<SeedResult> {
  await systemRepository.resetAllData();
  invalidateUser();
  return seedDemoData(opts);
}
