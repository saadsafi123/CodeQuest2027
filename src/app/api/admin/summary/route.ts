// Purpose: GET the AI-written admin summary (admin only). ?refresh=1 skips the short cache.
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { adminSummary } from "@/lib/services/summaryService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  return respond(async () => ({ summary: await adminSummary(await getCurrentUser(), { refresh }) }));
}
