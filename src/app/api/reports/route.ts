// Purpose: POST a new report (students); GET the current user's own reports. Thin: validate -> service -> respond.
// The optional picker (`hint`) and the answer to a "where?" question (`choice`) are only hints/answers: the service
// reconciles them with the place named in the text (rules/placeHint.ts).
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { respond } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { ingestReport, listMyReports } from "@/lib/services/reportService";

export const dynamic = "force-dynamic";

const body = z.object({
  text: z.string().min(1).max(5000),
  hint: z.object({ department: z.string().max(20).nullish(), locationId: z.string().max(80).nullish() }).nullish(),
  choice: z.string().max(80).nullish(),
  placeText: z.string().max(200).nullish(),
  /** true = only ask the counter-questions / show the summary; nothing is saved */
  preview: z.boolean().nullish(),
  followUpAnswers: z.number().int().min(0).max(20).nullish(),
});

export async function GET() {
  return respond(async () => ({ reports: await listMyReports(await getCurrentUser()) }));
}

export async function POST(req: Request) {
  let created = true;
  const res = await respond(async () => {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ServiceError("bad_request", "Report text is required.");
    const report = await ingestReport(await getCurrentUser(), parsed.data.text, { hint: parsed.data.hint, choice: parsed.data.choice, placeText: parsed.data.placeText, dryRun: !!parsed.data.preview, followUpAnswers: parsed.data.followUpAnswers ?? 0 });
    created = !["needs_place", "needs_problem", "needs_confirm"].includes(report.status); // a question or a summary is not a created report
    return { report };
  }, 201);
  // respond() fixes the status before we know the outcome: a question / summary answer is a plain 200
  if (!created && res.status === 201) return new Response(res.body, { status: 200, headers: res.headers });
  return res;
}
