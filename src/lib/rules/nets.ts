// Purpose: combine AI/fallback extraction with the deterministic nets. NETS ALWAYS WIN, and only in the raising
// direction: a net can set a hazard, set confidential, set the injection flag; it can never clear what the AI found.
// This is pure (no AI, no I/O) so it is tested with canned extractions.
// NOTE: this does NOT compute priority. It reports facts (forceCritical) that priority.ts will use later;
// the injection flag deliberately changes nothing.
import type { Extraction } from "@/lib/ai/schema";
import { detectInjection } from "./injection";
import { detectHarassment, detectSafetyHazard, type HazardType } from "./safety";

export type Source = "ai" | "net" | "both" | null;

export interface NetFlags {
  safetyHazard: boolean;
  hazardTypes: HazardType[];
  safetySource: Source;
  /** Harassment/ragging: the report must be confidential. */
  confidential: boolean;
  confidentialSource: Source;
  injectionDetected: boolean;
  injectionSource: Source;
  /** Any safety hazard forces the top tier (applied by priority.ts, not here). */
  forceCritical: boolean;
  /** Pattern ids that matched (diagnostics only). */
  netMatches: string[];
}

export interface NetResult {
  /** The extraction with net findings merged in (never weaker than the input). */
  extraction: Extraction;
  flags: NetFlags;
}

function source(ai: boolean, net: boolean): Source {
  return ai && net ? "both" : ai ? "ai" : net ? "net" : null;
}

export function applyNets(extraction: Extraction, rawText: string): NetResult {
  const hazard = detectSafetyHazard(rawText);
  const harass = detectHarassment(rawText);
  const inj = detectInjection(rawText);

  const aiHazard = extraction.safety_hazard.is_hazard;
  const aiHarass = extraction.is_harassment_or_ragging;
  const aiInj = extraction.injection_attempt_detected;

  const merged: Extraction = { ...extraction, safety_hazard: { ...extraction.safety_hazard } };

  if (hazard.hazard) {
    merged.safety_hazard.is_hazard = true;
    // keep the AI's type if it gave one, otherwise take the net's most severe type
    if (merged.safety_hazard.type === "none") merged.safety_hazard.type = hazard.types[0];
  }
  if (harass.confidential) merged.is_harassment_or_ragging = true;
  if (inj.detected) merged.injection_attempt_detected = true;

  const isHazard = merged.safety_hazard.is_hazard;
  const confidential = merged.is_harassment_or_ragging;
  if (isHazard && merged.problem_category !== "harassment" && !confidential) merged.problem_category = merged.problem_category === "other" ? "safety" : merged.problem_category;

  const types = [...hazard.types];
  if (aiHazard && merged.safety_hazard.type !== "none" && !types.includes(merged.safety_hazard.type)) types.push(merged.safety_hazard.type);

  return {
    extraction: merged,
    flags: {
      safetyHazard: isHazard,
      hazardTypes: types,
      safetySource: source(aiHazard, hazard.hazard),
      confidential,
      confidentialSource: source(aiHarass, harass.confidential),
      injectionDetected: merged.injection_attempt_detected,
      injectionSource: source(aiInj, inj.detected),
      forceCritical: isHazard,
      netMatches: [...hazard.matched, ...harass.matched, ...inj.matched],
    },
  };
}
