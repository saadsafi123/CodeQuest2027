// Purpose: GET every student's trust score, current weight and ledger size (admin only).
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { listStudentTrust } from "@/lib/services/trustService";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(async () => ({ students: await listStudentTrust(await getCurrentUser()) }));
}
