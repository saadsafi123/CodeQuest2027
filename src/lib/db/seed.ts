// Purpose: seed the demo data (users + trust ledger). Used by `npm run db:seed`, `db:reset` and the Reset button.
// TODO (later prompts): optionally seed a few demo issues/reports for the pitch.
import "server-only";
import { userRepository } from "./repositories";

export async function seedDemoData(): Promise<{ users: number }> {
  const users = await userRepository.seedDemoUsers();
  return { users };
}
