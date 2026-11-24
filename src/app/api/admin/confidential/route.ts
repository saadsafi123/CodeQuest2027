// Purpose: GET the confidential queue (admin only; reporter always "Anonymous reporter").
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { listConfidentialQueue } from "@/lib/services/issueService";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(async () => ({ issues: await listConfidentialQueue(await getCurrentUser()) }));
}
