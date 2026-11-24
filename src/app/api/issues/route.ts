// Purpose: GET the issues the current user may see (student: mine; staff: own department; admin: all non-confidential).
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { listMyIssues, listQueue } from "@/lib/services/issueService";
import { ServiceError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(async () => {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError("unauthorized", "Select a user first.");
    return { issues: user.role === "student" ? await listMyIssues(user) : await listQueue(user) };
  });
}
