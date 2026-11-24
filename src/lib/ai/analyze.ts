// Purpose: the single entry point for "understand one report": extract (Gemini or fallback) THEN apply the
// deterministic nets, which always win. Output feeds later steps (location, grouping, priority, routing).
// It does not decide priority, location validity, grouping, or anything about users.
import { applyNets, type NetFlags } from "@/lib/rules/nets";
import { extractReport, type ExtractOutcome } from "./extract";
import type { StructuredOptions } from "./client";
import type { Extraction } from "./schema";

export interface AnalyzedReport {
  extraction: Extraction;
  flags: NetFlags;
  mode: ExtractOutcome["mode"];
  fallbackReason?: string;
  attempts: number;
}

export async function analyzeReport(rawText: string, opts: StructuredOptions = {}): Promise<AnalyzedReport> {
  const outcome = await extractReport(rawText, opts);
  const { extraction, flags } = applyNets(outcome.extraction, rawText);
  return { extraction, flags, mode: outcome.mode, fallbackReason: outcome.fallbackReason, attempts: outcome.attempts };
}
