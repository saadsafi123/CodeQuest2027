// Purpose: GET the trending board (any signed-in user). Non-confidential issues only; no student identities.
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { listTrending } from "@/lib/services/trendingService";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(async () => ({ trending: await listTrending(await getCurrentUser()) }));
}
