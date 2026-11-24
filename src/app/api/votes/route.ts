// Purpose: POST a confirm/dispute vote on a resolved issue (affected students only; one per resolution round).
// Thin: validate -> service -> respond. The server decides eligibility and weight; the client sends only the choice.
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { castVote } from "@/lib/services/voteService";

export const dynamic = "force-dynamic";

const body = z.object({ issueId: z.string().uuid(), vote: z.enum(["confirm", "dispute"]) });

export async function POST(req: Request) {
  return respond(async () => {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ServiceError("bad_request", "Choose confirm or dispute for a valid issue.");
    return { vote: await castVote(await getCurrentUser(), parsed.data.issueId, parsed.data.vote) };
  }, 201);
}
