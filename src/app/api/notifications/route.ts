// Purpose: GET the signed-in user's notifications (derived, read-only). Polled by the bell.
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { listNotifications } from "@/lib/services/notificationService";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await respond(async () => ({ notices: await listNotifications(await getCurrentUser()) }));
  res.headers.set("cache-control", "no-store");
  return res;
}
