// Purpose: shared route helper: turn a service result/error into a JSON response (no business logic here).
import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/services/errors";

export async function respond<T>(fn: () => Promise<T>, okStatus = 200): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { status: okStatus });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("route error:", e instanceof Error ? e.message : "unknown");
    // Never leak internals. A slow or unreachable database gets its own plain message.
    const slow = e instanceof Error && /timed out|fetch failed|ECONN|ENOTFOUND/i.test(`${e.name} ${e.message}`);
    const error = slow ? "The database is slow or unreachable right now. Your data is safe: please try again in a moment." : "Something went wrong. Please try again.";
    return NextResponse.json({ error, code: "unavailable" }, { status: 503 });
  }
}
