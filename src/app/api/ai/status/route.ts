// Purpose: safe AI status for the banner: counts only, NEVER key material.
import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/ai/keyPool";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getAiStatus());
}
