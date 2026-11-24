// Purpose: passwordless user switch. Sets the current-user cookie (id only) after verifying the user exists.
import { NextResponse } from "next/server";
import { z } from "zod";
import { USER_COOKIE } from "@/lib/auth";
import { getUser } from "@/lib/services/userService";

export const dynamic = "force-dynamic";

const body = z.object({ userId: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "userId (uuid) required" }, { status: 400 });
  try {
    const user = await getUser(parsed.data.userId);
    if (!user) return NextResponse.json({ error: "unknown user" }, { status: 404 });
    const res = NextResponse.json({ user });
    res.cookies.set(USER_COOKIE, user.id, { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 503 });
  }
}
