// Purpose: POST a status change (department staff of the owning department, or admin).
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { changeStatus } from "@/lib/services/issueService";
import { ServiceError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

const body = z.object({ to: z.enum(["in_progress", "resolved", "closed", "open", "reopened"]), note: z.string().max(500).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await ctx.params;
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) throw new ServiceError("bad_request", "A valid status is required.");
    return { issue: await changeStatus(await getCurrentUser(), id, parsed.data.to, parsed.data.note ?? null) };
  });
}
