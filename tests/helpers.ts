// Test helpers: mock Gemini callers and pools. Nothing here touches the network.
import { AiBlockedError, KeyPool } from "@/lib/ai/keyPool";
import type { GeminiCaller } from "@/lib/ai/client";
import type { Extraction } from "@/lib/ai/schema";

process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || "test-model";

/** An AI answer that sees nothing special: misses hazards, harassment and injections (worst case for the nets). */
export const BENIGN_AI: Extraction = {
  language: "english",
  normalized_text_en: "something is wrong",
  department_guess: "unknown",
  raw_location_mention: null,
  problem_category: "other",
  problem_signature: "general problem",
  safety_hazard: { is_hazard: false, type: "none" },
  is_harassment_or_ragging: false,
  injection_attempt_detected: false,
  one_line_reason: "General problem.",
};

export const callerReturning = (obj: unknown): GeminiCaller => async () => JSON.stringify(obj);
export const callerRawText = (text: string): GeminiCaller => async () => text;
export const callerBlocked: GeminiCaller = async () => {
  throw new AiBlockedError("blocked: SAFETY");
};

export const poolWithKeys = (n = 2) => new KeyPool(Array.from({ length: n }, (_, i) => `test-key-${i + 1}`));
export const emptyPool = () => new KeyPool([]);
