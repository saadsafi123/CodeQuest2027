// Purpose: confidentiality enforcement helpers (hard rule 4). Repositories filter at the query level; these are
// the second line of defence used by services and tests.
//  - confidential issues are visible only to the admin (anonymized) and to their own reporter (minimal view)
//  - they are never grouped, never in a department queue, never on any board, never routed to a department
export const ANONYMOUS_REPORTER = "Anonymous reporter";

export interface HasConfidential {
  isConfidential: boolean;
}

/** Keep only what a public/department listing may show. */
export function publicOnly<T extends HasConfidential>(items: T[]): T[] {
  return items.filter((i) => !i.isConfidential);
}

/** Throws if a confidential item is about to enter a public/department/grouping code path. */
export function assertNotConfidential(item: HasConfidential, where: string): void {
  if (item.isConfidential) throw new Error(`Confidential item reached a non-confidential path: ${where}`);
}
