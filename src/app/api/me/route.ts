// Purpose: GET the signed-in user's live trust score (from the ledger, never cached). Polled by the top bar and the dashboard.
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { getMyTrust } from "@/lib/services/trustService";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await respond(async () => ({ trust: await getMyTrust(await getCurrentUser()) }));
  res.headers.set("cache-control", "no-store");
  return res;
}
