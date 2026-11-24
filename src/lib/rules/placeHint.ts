// Purpose: the optional department -> place picker on the report form is only a HINT. This pure rule decides what to do
// when the picker and the text disagree or when the text names no place. All of it is code; the AI is not involved.
//   * the text names a clear place:  text wins when they agree; if the picker says something else, ASK the student
//   * the text names no place:       a picked place is used; a picked department narrows the question; nothing picked -> ASK
//   * the text names an unknown / ambiguous place: a picked place that matches one of the readings settles it; otherwise ASK
// "Ask" always happens BEFORE the report is saved or routed. A hint never changes a hazard's priority (priority never
// looks at the place) and never beats a clear place in the text.
import { DEPARTMENT_CODES } from "@/lib/departments";
import { getLocationById, listLocations, type LocationDecision, type LocationRef } from "./location";

export interface PlaceHint {
  department?: string | null;
  locationId?: string | null;
}

export type OptionTag = "from_text" | "from_picker";
export interface PlaceOption extends LocationRef {
  tag?: OptionTag;
}

export type PlaceAskReason = "no_place" | "conflict" | "unknown_with_hint";

export type PlaceResolution =
  | { kind: "resolved"; location: LocationRef; source: "text" | "picker" }
  | { kind: "ask"; reason: PlaceAskReason; question: string; options: PlaceOption[] }
  /** nothing to reconcile: continue with the normal flow (a saved clarification question) */
  | { kind: "defer" };

/** Keep only a department code / place id that really exist; anything else is ignored (never trusted). */
export function cleanHint(raw: PlaceHint | null | undefined): { department: string | null; location: LocationRef | null } {
  const location = raw?.locationId ? getLocationById(raw.locationId) : null;
  const dept = raw?.department && DEPARTMENT_CODES.includes(raw.department) ? raw.department : null;
  return { department: location?.owner ?? dept, location };
}

/** Places owned by a department, buildings first, as tappable options. */
export function placesOfDepartment(dept: string, limit = 12): LocationRef[] {
  return listLocations()
    .filter((l) => l.owner === dept)
    .sort((a, b) => (a.type === "building" ? 0 : 1) - (b.type === "building" ? 0 : 1) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const tag = (l: LocationRef, t: OptionTag): PlaceOption => ({ ...l, tag: t });
const uniq = (xs: PlaceOption[]) => [...new Map(xs.map((x) => [x.id, x])).values()];

export function reconcilePlace(decision: LocationDecision, rawHint: PlaceHint | null | undefined, confidential: boolean): PlaceResolution {
  if (confidential) return { kind: "defer" }; // a confidential report never needs a place and never uses the picker
  const hint = cleanHint(rawHint);

  // 1. the text names a clear place
  if (decision.status === "resolved" && decision.location) {
    const L = decision.location;
    if (hint.location && hint.location.id !== L.id) {
      return {
        kind: "ask",
        reason: "conflict",
        question: `Your text says ${L.name}, but you picked ${hint.location.name}. Which one is the problem at?`,
        options: [tag(L, "from_text"), tag(hint.location, "from_picker")],
      };
    }
    if (!hint.location && hint.department && L.owner !== hint.department) {
      return {
        kind: "ask",
        reason: "conflict",
        question: `Your text says ${L.name}, but you picked a different department. Which place is the problem at?`,
        options: uniq([tag(L, "from_text"), ...placesOfDepartment(hint.department, 3).map((p) => tag(p, "from_picker"))]),
      };
    }
    return { kind: "resolved", location: L, source: "text" };
  }

  // 2. the text names no place at all
  if (decision.reason === "no_location") {
    if (hint.location) return { kind: "resolved", location: hint.location, source: "picker" };
    if (hint.department) {
      return {
        kind: "ask",
        reason: "no_place",
        question: "Where is this problem? Pick the place.",
        options: placesOfDepartment(hint.department).map((p) => tag(p, "from_picker")),
      };
    }
    return { kind: "ask", reason: "no_place", question: "Where is this problem?", options: [] };
  }

  // 3. the text names a place we cannot pin down (unknown, ambiguous, vague, or two places)
  if (hint.location) {
    const reading = decision.suggestions.some((s) => s.id === hint.location!.id);
    if (reading && decision.reason !== "unknown_place") return { kind: "resolved", location: hint.location, source: "picker" };
    return {
      kind: "ask",
      reason: "unknown_with_hint",
      question: `${decision.mention ? `I couldn't match "${decision.mention}" to a known place. ` : ""}You picked ${hint.location.name}. Is the problem there?`,
      options: uniq([tag(hint.location, "from_picker"), ...decision.suggestions.slice(0, 3).map((s) => tag(s, "from_text"))]),
    };
  }
  if (decision.reason === "vague_place") {
    // "lab" / "room": a type, not a place. Ask now (before saving), narrowed to the picked department when there is one.
    const pool = hint.department ? decision.suggestions.filter((s) => s.owner === hint.department) : decision.suggestions;
    if (hint.department && pool.length === 1) return { kind: "resolved", location: pool[0], source: "picker" };
    return {
      kind: "ask",
      reason: "no_place",
      question: decision.question ?? "Which place exactly?",
      options: (pool.length ? pool : decision.suggestions).map((p) => tag(p, "from_text")),
    };
  }
  if (hint.department && decision.reason !== "unknown_place") {
    const narrowed = decision.suggestions.filter((s) => s.owner === hint.department);
    if (narrowed.length === 1) return { kind: "resolved", location: narrowed[0], source: "picker" };
  }
  return { kind: "defer" };
}
