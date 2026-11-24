// Purpose: user listing, passwordless switching and student creation (judge access).
import "server-only";
import { userRepository, type User } from "@/lib/db/repositories";

export function listUsers(): Promise<User[]> {
  return userRepository.list();
}

// Short-lived in-process cache: every page and API call looks the user up, and a Supabase round trip costs ~300 ms.
// Role and department never change in the app, and trust changes call invalidateUser(), so permissions are unaffected.
const USER_CACHE_TTL_MS = 10_000;
type Cached = { user: User; exp: number };
const userCache = (): Map<string, Cached> => ((globalThis as { __rfUserCache?: Map<string, Cached> }).__rfUserCache ??= new Map());

export function invalidateUser(id?: string): void {
  if (id) userCache().delete(id);
  else userCache().clear();
}

export async function getUser(id: string): Promise<User | null> {
  const hit = userCache().get(id);
  if (hit && hit.exp > Date.now()) return hit.user;
  const user = await userRepository.getById(id);
  if (user) userCache().set(id, { user, exp: Date.now() + USER_CACHE_TTL_MS });
  else userCache().delete(id);
  return user;
}

export async function createStudent(name?: string): Promise<User> {
  const clean = name?.trim().slice(0, 60);
  const finalName = clean || `New Student ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return userRepository.createStudent(finalName);
}
