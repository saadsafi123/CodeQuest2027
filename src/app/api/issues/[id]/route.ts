// Purpose: GET one issue (permission-checked in the service; anything not visible is "not found").
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { getIssueDetail } from "@/lib/services/issueService";
import { ServiceError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new ServiceError("not_found", "Issue not found.");
    return { issue: await getIssueDetail(await getCurrentUser(), id) };
  });
}
