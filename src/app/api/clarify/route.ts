// Purpose: POST the author's answer to a clarification question (free text or one of the offered place ids).
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { answerClarification } from "@/lib/services/reportService";

export const dynamic = "force-dynamic";

const body = z
  .object({ reportId: z.string().uuid(), answer: z.string().max(500).optional(), locationId: z.string().max(100).optional() })
  .refine((b) => b.answer || b.locationId, { message: "answer or locationId required" });

export async function POST(req: Request) {
  return respond(async () => {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ServiceError("bad_request", "reportId and an answer are required.");
    return { report: await answerClarification(await getCurrentUser(), parsed.data) };
  });
}
