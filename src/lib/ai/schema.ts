// Purpose: zod schema for the AI extraction output + the matching Gemini responseSchema (JSON mode).
// The schema deliberately has NO priority, trust, vote or permission fields: the AI cannot set them.
import { z } from "zod";

export const DEPARTMENT_VALUES = ["EE", "CSE", "IS", "Library", "Cafeteria", "unknown"] as const;
export const LANGUAGE_VALUES = ["english", "roman_urdu", "mixed", "other"] as const;
export const CATEGORY_VALUES = [
  "network",
  "electrical",
  "hvac",
  "equipment",
  "plumbing",
  "cleanliness",
  "furniture",
  "food",
  "library_service",
  "safety",
  "harassment",
  "other",
] as const;
export const HAZARD_TYPES = ["none", "fire", "sparks", "gas", "smoke", "shock", "medical", "structural"] as const;

export const ExtractionSchema = z.object({
  language: z.enum(LANGUAGE_VALUES),
  normalized_text_en: z.string().max(1000),
  department_guess: z.enum(DEPARTMENT_VALUES),
  raw_location_mention: z.string().max(200).nullable(),
  problem_category: z.enum(CATEGORY_VALUES),
  problem_signature: z.string().min(1).max(100),
  safety_hazard: z.object({
    is_hazard: z.boolean(),
    type: z.enum(HAZARD_TYPES),
  }),
  is_harassment_or_ragging: z.boolean(),
  injection_attempt_detected: z.boolean(),
  one_line_reason: z.string().max(300),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Department = Exclude<(typeof DEPARTMENT_VALUES)[number], "unknown">;

/** Gemini responseSchema (OpenAPI subset). Keep in sync with ExtractionSchema; zod stays the source of truth. */
export const geminiResponseSchema = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING", enum: [...LANGUAGE_VALUES] },
    normalized_text_en: { type: "STRING" },
    department_guess: { type: "STRING", enum: [...DEPARTMENT_VALUES] },
    raw_location_mention: { type: "STRING", nullable: true },
    problem_category: { type: "STRING", enum: [...CATEGORY_VALUES] },
    problem_signature: { type: "STRING" },
    safety_hazard: {
      type: "OBJECT",
      properties: {
        is_hazard: { type: "BOOLEAN" },
        type: { type: "STRING", enum: [...HAZARD_TYPES] },
      },
      required: ["is_hazard", "type"],
    },
    is_harassment_or_ragging: { type: "BOOLEAN" },
    injection_attempt_detected: { type: "BOOLEAN" },
    one_line_reason: { type: "STRING" },
  },
  required: [
    "language",
    "normalized_text_en",
    "department_guess",
    "raw_location_mention",
    "problem_category",
    "problem_signature",
    "safety_hazard",
    "is_harassment_or_ragging",
    "injection_attempt_detected",
    "one_line_reason",
  ],
} as const;

/** Same-problem comparison output (used later by grouping). */
export const SameProblemSchema = z.object({ same_problem: z.boolean(), reason: z.string().max(300) });
