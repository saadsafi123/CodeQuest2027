// Purpose: judge "Reset all data": wipes every table and reseeds demo users. Intentionally unauthenticated (judge access).
import { NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/auth";
import { resetAllData } from "@/lib/services/adminService";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await resetAllData();
    const res = NextResponse.json({ ok: true, ...result });
    res.cookies.delete(USER_COOKIE); // old new-student accounts no longer exist
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 503 });
  }
}
