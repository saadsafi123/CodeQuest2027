// Purpose: POST a flag (spam / fake / abuse) on one report. Staff of the owning department or the admin only.
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { flagReport } from "@/lib/services/issueService";

export const dynamic = "force-dynamic";

const body = z.object({ kind: z.enum(["spam", "fake", "abuse"]), note: z.string().max(300).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await ctx.params;
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) throw new ServiceError("bad_request", "Choose spam, fake or abuse.");
    return { flag: await flagReport(await getCurrentUser(), id, parsed.data.kind, parsed.data.note ?? null) };
  });
}
