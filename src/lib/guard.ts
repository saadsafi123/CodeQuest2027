// Purpose: server-side page guards. Pages call these FIRST; nothing the client says (cookie contents aside, which
// is only a user id) is trusted: role and department always come from the database via getCurrentUser().
import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { Role, User } from "@/lib/db/repositories";

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "staff" ? "/staff" : "/student";
}

/** Returns the signed-in user if their role is allowed; otherwise redirects (no user -> landing, wrong role -> their own home). */
export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/?need=signin");
  if (!roles.includes(user.role)) redirect(`${homeFor(user.role)}?denied=1`);
  return user;
}
