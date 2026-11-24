// Purpose: GET list demo users (safe fields only); POST create a brand-new student (judge access).
import { NextResponse } from "next/server";
import { z } from "zod";
import { USER_COOKIE } from "@/lib/auth";
import { createStudent, listUsers } from "@/lib/services/userService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ users: await listUsers() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 503 });
  }
}

const body = z.object({ name: z.string().max(60).optional() });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  try {
    const user = await createStudent(parsed.data.name);
    const res = NextResponse.json({ user }, { status: 201 });
    res.cookies.set(USER_COOKIE, user.id, { path: "/", httpOnly: true, sameSite: "lax" }); // switch to the new account
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 503 });
  }
}
