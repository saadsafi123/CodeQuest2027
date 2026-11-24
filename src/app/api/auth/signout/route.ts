// Purpose: sign out = clear the current-user cookie (there are no passwords or sessions in this demo).
import { NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  return res;
}
