// Purpose: department codes and full names, read from src/data/departments.json (the ONE place the names live).
// Pure (no server-only import), so UI, prompts and tests all use the same source.
import data from "@/data/departments.json";

export const DEPARTMENT_LIST = data.departments as readonly { code: string; name: string; handles: readonly string[] }[];
export const DEPARTMENT_CODES = DEPARTMENT_LIST.map((d) => d.code);
export const DEPARTMENT_NAMES: Record<string, string> = Object.fromEntries(DEPARTMENT_LIST.map((d) => [d.code, d.name]));

/** Full name for a department code ("CSE" -> "Computer Software Engineering"); unknown codes come back unchanged. */
export function departmentName(code: string | null | undefined): string {
  return code ? (DEPARTMENT_NAMES[code] ?? code) : "";
}

/** "CSE (Computer Software Engineering)", for places where the short code needs its meaning next to it. */
export function departmentLabel(code: string): string {
  const n = DEPARTMENT_NAMES[code];
  return n && n !== code ? `${code} (${n})` : code;
}
