// Purpose: decide which queue an issue belongs to. Deterministic; the AI's department_guess is NOT used.
//  - confidential (harassment/ragging): admin-only confidential queue, NEVER a department (hard rule 4)
//  - otherwise the department that OWNS the resolved place (D13)
//  - place with no owning department (Main Gate, Parking): admin queue until a department is named (D28)
import type { Dept, LocationRef } from "./location";

export type Queue = "confidential" | "department" | "admin";

export interface Route {
  queue: Queue;
  department: Dept | null;
  reason: string;
}

export function routeIssue(input: { confidential: boolean; location: LocationRef | null }): Route {
  if (input.confidential) {
    return { queue: "confidential", department: null, reason: "Confidential report: handled by the admin only." };
  }
  const loc = input.location;
  if (!loc) throw new Error("routeIssue: a non-confidential report must have a resolved location (never route without one)");
  if (loc.owner) return { queue: "department", department: loc.owner, reason: `${loc.name} is owned by ${loc.owner}.` };
  return { queue: "admin", department: null, reason: `${loc.name} has no owning department, so the admin assigns it.` };
}
