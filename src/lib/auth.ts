// Purpose: passwordless "current user" for judge access. The cookie holds only a user id; the role and
// department are ALWAYS looked up server-side, never trusted from the client.
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "@/lib/db/repositories";
import { getUser } from "@/lib/services/userService";
import { isDbConfigured } from "@/lib/db/supabase";

export const USER_COOKIE = "reportfix_user";

/** Returns the current user, or null if none is selected / DB is unavailable. Never throws. */
// cache(): the layout and the page both ask for the user in one request; look it up once.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!isDbConfigured()) return null;
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return await getUser(id);
  } catch {
    return null;
  }
});
