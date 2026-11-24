// Purpose: POST the admin's choice of place for a report whose clarification limit was reached.
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { adminAssignLocation } from "@/lib/services/reportService";

export const dynamic = "force-dynamic";

const body = z.object({ reportId: z.string().uuid(), locationId: z.string().max(100) });

export async function POST(req: Request) {
  return respond(async () => {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ServiceError("bad_request", "reportId and locationId are required.");
    return { report: await adminAssignLocation(await getCurrentUser(), parsed.data.reportId, parsed.data.locationId) };
  });
}
