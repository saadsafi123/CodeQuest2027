// Purpose: extract structured fields from ONE report: a single Gemini JSON-mode call through the key pool,
// validated with zod, falling back to the rule-based extractor on ANY failure (no keys, rate limits, blocks,
// invalid output, AI_MODE=fallback). Never throws. Only the (sanitized) report text is sent; no identity.
import { config } from "@/lib/config";
import { hasReadableContent, sanitizeReportText } from "@/lib/rules/text";
import { generateStructuredJson, type StructuredOptions } from "./client";
import { extractWithRules } from "./fallback";
import { EXTRACTION_SYSTEM_PROMPT, buildUserContent } from "./prompts";
import { ExtractionSchema, geminiResponseSchema, type Extraction } from "./schema";

export interface ExtractOutcome {
  extraction: Extraction;
  mode: "gemini" | "fallback";
  /** Why the fallback ran (e.g. no_keys_configured, all_keys_unavailable, blocked, bad_output). */
  fallbackReason?: string;
  attempts: number;
}

export class EmptyReportError extends Error {
  constructor() {
    super("Report text is empty");
    this.name = "EmptyReportError";
  }
}

/** Sanitize raw input. Throws EmptyReportError if nothing is left. */
export function prepareReportText(raw: string): string {
  const text = sanitizeReportText(raw, config.report.maxChars);
  if (!text || !hasReadableContent(text)) throw new EmptyReportError();
  return text;
}

export async function extractReport(rawText: string, opts: StructuredOptions = {}): Promise<ExtractOutcome> {
  const text = prepareReportText(rawText);

  const res = await generateStructuredJson(
    {
      system: EXTRACTION_SYSTEM_PROMPT,
      user: buildUserContent(text),
      responseSchema: geminiResponseSchema as unknown as Record<string, unknown>,
    },
    (v) => ExtractionSchema.parse(v),
    opts,
  );

  if (res.ok) return { extraction: res.value, mode: "gemini", attempts: res.attempts };
  return { extraction: extractWithRules(text), mode: "fallback", fallbackReason: res.reason, attempts: res.attempts };
}
