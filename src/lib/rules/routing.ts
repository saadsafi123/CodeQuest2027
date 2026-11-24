// Purpose: decide which queue an issue belongs to.
//  - confidential (harassment/ragging): admin-only confidential queue, NEVER a department (hard rule 4)
//  - otherwise the DEPARTMENT IS DECIDED BY THE AI (the problem statement: "AI routes each one to the right department").
//    Code only validates the answer: it must be a real department, and it is not trusted when the report tried to
//    instruct the system (injection) because the text may have steered it.
//  - if the AI gave no usable department (unknown / invalid / injection), the owner of the resolved place is the safety net (D13)
//  - no AI department and no owning department (Main Gate, Parking): admin queue until a department is named (D28)
// Nothing here looks at tone, capital letters or the word "urgent".
import { DEPARTMENT_CODES } from "@/lib/departments";
import type { Dept, LocationRef } from "./location";

export type Queue = "confidential" | "department" | "admin";
/** Who made the department decision. */
export type RouteSource = "ai" | "place_owner" | "admin" | "confidential";

export interface Route {
  queue: Queue;
  department: Dept | null;
  source: RouteSource;
  reason: string;
}

export interface RouteInput {
  confidential: boolean;
  location: LocationRef | null;
  /** The AI's `department_guess` (any string; validated here). */
  aiDepartment?: string | null;
  /** The report tried to instruct the system: the AI's routing vote is not trusted. */
  injection?: boolean;
  /** Which reader produced aiDepartment: Gemini, or the rule-based fallback reader. Only changes the wording. */
  aiMode?: "gemini" | "fallback";
}

function validDepartment(v: string | null | undefined): Dept | null {
  return v && DEPARTMENT_CODES.includes(v) ? (v as Dept) : null;
}

export function routeIssue(input: RouteInput): Route {
  if (input.confidential) {
    return { queue: "confidential", department: null, source: "confidential", reason: "Confidential report: handled by the admin only." };
  }
  const loc = input.location;
  if (!loc) throw new Error("routeIssue: a non-confidential report must have a resolved location (never route without one)");

  const ai = validDepartment(input.aiDepartment);
  if (ai && !input.injection) {
    const by = input.aiMode === "fallback" ? "the rule-based reader (AI unavailable)" : "the AI";
    const differs = loc.owner && loc.owner !== ai ? ` The place belongs to ${loc.owner}, but the problem is for ${ai}.` : "";
    return { queue: "department", department: ai, source: "ai", reason: `Routed to ${ai} by ${by}.${differs}` };
  }

  const why = input.injection ? "The report tried to give the system instructions, so the AI's routing was not trusted." : "The AI could not tell which department.";
  if (loc.owner) return { queue: "department", department: loc.owner, source: "place_owner", reason: `${why} ${loc.name} is owned by ${loc.owner}, so it went there.` };
  return { queue: "admin", department: null, source: "admin", reason: `${why} ${loc.name} has no owning department, so the admin assigns it.` };
}
