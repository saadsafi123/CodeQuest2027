// Purpose: GET the trust explainer: a student's own ledger (no userId), or any student's ledger for the admin.
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { getTrustBreakdown } from "@/lib/services/trustService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return respond(async () => {
    const user = await getCurrentUser();
    const raw = new URL(req.url).searchParams.get("userId");
    if (raw !== null && !z.string().uuid().safeParse(raw).success) throw new ServiceError("not_found", "Student not found.");
    return { trust: await getTrustBreakdown(user, raw ?? user?.id ?? "") };
  });
}
