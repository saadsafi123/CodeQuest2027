// Purpose: thin Gemini wrapper. One structured-output (JSON mode) call, executed through the key pool.
// SERVER ONLY. Model names come from env GEMINI_MODELS / GEMINI_MODEL (never hardcoded). Never sends user identity.
import "server-only";
import { GoogleGenAI } from "@google/genai";
import { AiBlockedError, AiOutputError, getKeyPool, parseModels, runWithKeyPool, type KeyPool, type PoolResult } from "./keyPool";

export interface StructuredRequest {
  /** System instruction (trusted). */
  system: string;
  /** User content (already wrapped in delimited data tags by prompts.ts). */
  user: string;
  /** JSON schema for Gemini's responseSchema. */
  responseSchema: Record<string, unknown>;
}

/** Low-level function that talks to Gemini with a specific key. Injectable for tests. */
export type GeminiCaller = (apiKey: string, model: string, req: StructuredRequest) => Promise<string>;

/** Thinking off/minimal: extraction is simple and thinking adds seconds. 2.5 takes a budget, 3.x takes a level. */
export function thinkingFor(model: string): Record<string, unknown> {
  if (/gemini-2\.5/.test(model)) return { thinkingConfig: { thinkingBudget: 0 } };
  if (/gemini-3/.test(model)) return { thinkingConfig: { thinkingLevel: "minimal" } };
  return {};
}

const realCaller: GeminiCaller = async (apiKey, model, req) => {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } }) // JSON mode + responseSchema need v1beta;
  const res = await ai.models.generateContent({
    model,
    contents: req.user,
    config: {
      systemInstruction: req.system,
      responseMimeType: "application/json",
      responseSchema: req.responseSchema,
      temperature: 0,
      // 2.5-series models think by default (slow); extraction is a simple task, so turn thinking off for speed.
      ...thinkingFor(model),
    },
  });
  if (res.promptFeedback?.blockReason) throw new AiBlockedError(`blocked: ${res.promptFeedback.blockReason}`);
  const finish = res.candidates?.[0]?.finishReason;
  if (finish && /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/i.test(String(finish))) {
    throw new AiBlockedError(`blocked: ${finish}`);
  }
  const text = res.text;
  if (!text || !text.trim()) throw new AiOutputError("empty response");
  return text;
};

export interface StructuredOptions {
  caller?: GeminiCaller;
  pool?: KeyPool;
}

/**
 * One structured (JSON-mode) Gemini call through the key pool. `validate` runs INSIDE the attempt, so an invalid
 * answer counts as a failed attempt and the next key is tried (capped). Never throws: failure => fallback result.
 */
export async function generateStructuredJson<T>(
  req: StructuredRequest,
  validate: (value: unknown) => T,
  opts: StructuredOptions = {},
): Promise<PoolResult<T>> {
  const pool = opts.pool ?? getKeyPool();
  const envModel = parseModels(process.env.GEMINI_MODELS, process.env.GEMINI_MODEL)[0];
  if (!pool.hasNamedModels && !envModel) return { ok: false, mode: "fallback", reason: "no_model_configured", attempts: 0 };
  const caller = opts.caller ?? realCaller;
  return runWithKeyPool(pool, async (apiKey, _label, poolModel) => {
    const model = poolModel || envModel;
    const text = await caller(apiKey, model, req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiOutputError("invalid JSON");
    }
    try {
      return validate(parsed);
    } catch {
      throw new AiOutputError("output failed validation");
    }
  });
}
