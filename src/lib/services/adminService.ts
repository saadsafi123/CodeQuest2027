// Purpose: judge/admin housekeeping: reset all data and reseed the demo data.
import "server-only";
import { systemRepository } from "@/lib/db/repositories";
import { seedDemoData } from "@/lib/db/seed";
import { invalidateUser } from "./userService";

export async function resetAllData(): Promise<{ users: number }> {
  await systemRepository.resetAllData();
  invalidateUser();
  return seedDemoData();
}
