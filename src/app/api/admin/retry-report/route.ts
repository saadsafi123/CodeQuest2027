// Purpose: POST a retry for a saved report that never got an issue ("needs attention"). Admin only.
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { adminRetryReport } from "@/lib/services/reportService";

export const dynamic = "force-dynamic";

const body = z.object({ reportId: z.string().uuid() });

export async function POST(req: Request) {
  return respond(async () => {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ServiceError("bad_request", "A valid report id is required.");
    return { report: await adminRetryReport(await getCurrentUser(), parsed.data.reportId) };
  });
}
