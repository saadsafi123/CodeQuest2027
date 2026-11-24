// Purpose: canonicalize a place mention against the campus gazetteer (src/data/campus.json). Deterministic, no AI.
// Rule R6 / hard rule 5: an unknown, ambiguous or missing place is NEVER guessed; the caller asks for clarification.
// Matching: normalize (typos, Roman Urdu numerals/fillers, "lab3" -> "lab 3"), then
//   A = every token of an alias appears in the mention (mention may have extra words)  -> most specific alias wins
//   B = every token of the mention appears in an alias (mention less specific)         -> only if it names something specific
// Several equally good places => ambiguous (ask). A department qualifier that contradicts the owner rejects the place
// ("ee sc lab" does not silently become the CSE "SC Lab").
import campus from "@/data/campus.json";
import { stripInjectedClauses } from "./injection";
import { config } from "@/lib/config";
import { editDistance, normalizeText } from "./text";

export type Dept = "EE" | "CSE" | "IS" | "Library" | "Cafeteria";

export interface LocationRef {
  id: string;
  name: string;
  type: string;
  /** Department that owns the place (decision D13); null = no owning department. */
  owner: Dept | null;
  source: "real" | "placeholder";
}

interface Entry extends LocationRef {
  variants: string[][];
  nameTokens: string[];
}

interface RawNode {
  id: string;
  name: string;
  type: string;
  owner?: Dept | null;
  source?: string;
  aliases?: string[];
  roman_urdu?: string[];
  children?: RawNode[];
}

// ------------------------------------------------------------- normalization

const FILLER = new Set([
  "the", "a", "an", "of", "in", "at", "on", "near", "inside", "outside", "by", "to", "from", "and", "or",
  "ka", "ki", "ke", "ko", "kay", "k", "mein", "me", "par", "pe", "se", "wala", "wali", "wale",
  "andar", "bahar", "paas", "area", "no", "number", "num", "nambar", "ground",
]);
const NUMERALS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  ek: "1", do: "2", teen: "3", char: "4", chaar: "4", panch: "5", paanch: "5",
  pehli: "1", pehla: "1", pehle: "1", dosri: "2", doosri: "2", dusri: "2", teesri: "3", tisri: "3",
};
const SYNONYMS: Record<string, string> = {
  labs: "lab", laboratory: "lab", laboratories: "lab", lb: "lab",
  building: "block",
  classroom: "room", class: "room", kamra: "room", rooms: "room",
  canteen: "cafeteria", cafe: "cafeteria",
  lib: "library",
  databases: "database",
};
/** Words that only say WHAT KIND of place, not which one. */
const GENERIC = new Set(["lab", "room", "block", "hall", "floor", "office", "department", "dept", "building"]);
const QUALIFIERS: Record<string, Dept> = { cse: "CSE", cs: "CSE", ee: "EE", electrical: "EE", is: "IS", it: "IS" };

/** Tokens of a place string, canonicalized (public for tests). */
export function locationTokens(input: string): string[] {
  const norm = normalizeText(input)
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2");
  const out: string[] = [];
  for (const raw of norm.split(" ")) {
    if (!raw || FILLER.has(raw) || /^(st|nd|rd|th)$/.test(raw)) continue;
    out.push(NUMERALS[raw] ?? SYNONYMS[raw] ?? raw);
  }
  return out;
}

const isNumeric = (t: string) => /^\d+$/.test(t);

function tokEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (isNumeric(a) || isNumeric(b)) return false;
  const min = Math.min(a.length, b.length);
  if (min >= config.location.fuzzyTwoTypoMinLen) return editDistance(a, b, 2) <= 2;
  if (min >= config.location.fuzzyOneTypoMinLen) return editDistance(a, b, 1) <= 1;
  return false;
}

const hasTok = (hay: string[], t: string) => hay.some((h) => tokEq(h, t));
const containsAll = (hay: string[], needles: string[]) => needles.length > 0 && needles.every((n) => hasTok(hay, n));
const sameTokens = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

// --------------------------------------------------------------- gazetteer

function flatten(nodes: RawNode[], parentOwner: Dept | null, out: Entry[]): void {
  for (const n of nodes) {
    const owner = n.owner !== undefined ? n.owner : parentOwner;
    const names = [n.name, ...(n.aliases ?? []), ...(n.roman_urdu ?? [])];
    const variants = names.map(locationTokens).filter((v) => v.length > 0);
    out.push({
      id: n.id,
      name: n.name,
      type: n.type,
      owner,
      source: n.source === "real" ? "real" : "placeholder",
      variants,
      nameTokens: locationTokens(n.name),
    });
    if (n.children?.length) flatten(n.children, owner, out);
  }
}

let cached: Entry[] | null = null;
function gazetteer(): Entry[] {
  if (!cached) {
    cached = [];
    flatten(campus.locations as unknown as RawNode[], null, cached);
  }
  return cached;
}

export function getLocationById(id: string): LocationRef | null {
  const e = gazetteer().find((x) => x.id === id);
  return e ? toRef(e) : null;
}

export function listLocations(): LocationRef[] {
  return gazetteer().map(toRef);
}

/** Entries of the gazetteer for tests/diagnostics. */
export function gazetteerEntries(): readonly { id: string; variants: string[][] }[] {
  return gazetteer();
}

const toRef = (e: Entry): LocationRef => ({ id: e.id, name: e.name, type: e.type, owner: e.owner, source: e.source });

// -------------------------------------------------------------- resolution

export type LocationResolution =
  | { status: "resolved"; location: LocationRef; matchedBy: "exact" | "alias" | "partial" }
  | { status: "ambiguous"; candidates: LocationRef[]; vague: boolean }
  | { status: "unknown"; suggestions: LocationRef[] }
  | { status: "none" };

function qualifierDepts(tokens: string[]): Dept[] {
  return tokens.filter((t) => t in QUALIFIERS).map((t) => QUALIFIERS[t]);
}

/** Does this token list name nothing specific (only "lab", "room", ...)? */
function isGenericOnly(tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((t) => GENERIC.has(t) || t in QUALIFIERS);
}

function suggestionsFor(tokens: string[], q: Dept[]): LocationRef[] {
  const types = new Set(tokens.filter((t) => GENERIC.has(t)));
  const scored = gazetteer()
    .filter((e) => q.length === 0 || (e.owner !== null && q.includes(e.owner)))
    .map((e) => {
      let score = 0;
      for (const t of tokens) {
        if (e.nameTokens.some((n) => tokEq(n, t))) score += GENERIC.has(t) ? 1 : 2;
      }
      if (types.has(e.type) || (types.has("room") && e.type === "classroom")) score += 1;
      return { e, score: score + (e.source === "real" ? 0.5 : 0) };
    })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score);
  // A bare "lab": every department has labs, so offer them all (grouped by department) instead of guessing four.
  const bareLab = types.has("lab") && tokens.every((t) => GENERIC.has(t)) && q.length === 0;
  const limit = bareLab ? config.location.maxLabSuggestions : config.location.maxSuggestions;
  const picked = (bareLab ? scored.filter((x) => x.e.type === "lab").sort((a, b) => String(a.e.owner).localeCompare(String(b.e.owner)) || a.e.name.localeCompare(b.e.name)) : scored).slice(0, limit).map((x) => toRef(x.e));
  if (picked.length > 0) return picked;
  return gazetteer()
    .filter((e) => e.type === "building" || e.type === "outdoor")
    .slice(0, config.location.maxSuggestions)
    .map(toRef);
}

/** Resolve a (student- or AI-written) place mention. Never guesses. */
export function resolveLocation(mention: string | null | undefined): LocationResolution {
  const tokens = locationTokens(mention ?? "");
  if (tokens.length === 0) return { status: "none" };
  return resolveTokens(tokens);
}

function resolveTokens(tokens: string[]): LocationResolution {
  const q = qualifierDepts(tokens);
  const entries = gazetteer().filter((e) => q.length === 0 || (e.owner !== null && q.includes(e.owner)));

  // A: alias fully inside the mention. Most specific (longest) alias wins; ties are ambiguous.
  const a: { e: Entry; spec: number; exact: boolean }[] = [];
  for (const e of entries) {
    let spec = 0;
    let exact = false;
    for (const v of e.variants) {
      if (containsAll(tokens, v) && v.length >= spec) {
        spec = v.length;
        exact = exact || sameTokens(v, tokens);
      }
    }
    if (spec > 0) a.push({ e, spec, exact });
  }
  if (a.length > 0) {
    const max = Math.max(...a.map((x) => x.spec));
    const top = a.filter((x) => x.spec === max);
    if (top.length === 1) {
      return { status: "resolved", location: toRef(top[0].e), matchedBy: top[0].exact ? "exact" : "alias" };
    }
    return { status: "ambiguous", candidates: top.map((x) => toRef(x.e)), vague: false };
  }

  // B: mention is a fragment of an alias ("networking", "ee lab").
  const b = entries.filter((e) => e.variants.some((v) => containsAll(v, tokens)));
  const specific = !isGenericOnly(tokens);
  if (b.length === 1 && specific) return { status: "resolved", location: toRef(b[0]), matchedBy: "partial" };
  if (b.length >= 1) return { status: "ambiguous", candidates: b.map(toRef), vague: !specific };

  return { status: "unknown", suggestions: suggestionsFor(tokens, q) };
}

/** Find a place named anywhere in free text (used only when no usable mention was extracted). */
export function findLocationInText(text: string): LocationResolution {
  const tokens = locationTokens(text);
  if (tokens.length === 0) return { status: "none" };
  const hits: { e: Entry; spec: number }[] = [];
  for (const e of gazetteer()) {
    let spec = 0;
    for (const v of e.variants) if (containsAll(tokens, v) && v.length > spec) spec = v.length;
    // a bare type word ("lab") is not a place name
    if (spec > 0 && !e.variants.some((v) => containsAll(tokens, v) && !isGenericOnly(v))) continue;
    if (spec > 0) hits.push({ e, spec });
  }
  if (hits.length === 0) return { status: "none" };
  const max = Math.max(...hits.map((h) => h.spec));
  const top = hits.filter((h) => h.spec === max);
  if (top.length === 1) return { status: "resolved", location: toRef(top[0].e), matchedBy: "alias" };
  return { status: "ambiguous", candidates: top.map((h) => toRef(h.e)), vague: false };
}

/** Every distinct place the text names by a SPECIFIC alias (a bare "lab" or "room" is not a place name). */
export function findAllLocationsInText(text: string): LocationRef[] {
  const tokens = locationTokens(text);
  if (tokens.length === 0) return [];
  return gazetteer()
    .filter((e) => e.variants.some((v) => containsAll(tokens, v) && !isGenericOnly(v)))
    .map(toRef);
}

// ----------------------------------------------------------------- decision

export type LocationReason = "unknown_place" | "ambiguous_place" | "vague_place" | "no_location";

export interface LocationDecision {
  /** resolved: proceed. needs_clarification: ask, do NOT route. not_required: confidential report, no place needed. */
  status: "resolved" | "needs_clarification" | "not_required";
  location: LocationRef | null;
  reason: LocationReason | null;
  mention: string | null;
  question: string | null;
  suggestions: LocationRef[];
}

function clip(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, config.location.maxMentionChars);
}

function buildQuestion(reason: LocationReason, mention: string | null, options: LocationRef[]): string {
  const list = options.map((o) => o.name).join(", ");
  switch (reason) {
    case "unknown_place":
      return `I couldn't find "${clip(mention ?? "")}" on campus. Which place do you mean?${list ? ` For example: ${list}.` : ""}`;
    case "ambiguous_place":
      return mention
        ? `"${clip(mention)}" could be more than one place: ${list}. Which one do you mean?`
        : `Your report names more than one place: ${list}. Which one is the problem at?`;
    case "vague_place":
      if (options.length > 1 && options.every((o) => o.type === "lab")) {
        return `Which lab do you mean? Each department has its own labs, so please pick one: ${list}.`;
      }
      return `Which place exactly?${list ? ` Options: ${list}.` : ""} Please give the building, room or lab name.`;
    case "no_location":
      return "Where is this problem? Please tell me the building, room or lab.";
  }
}

/**
 * Decide what to do about the place in a report.
 * - A specific mention is trusted as written: if it is unknown we ask, we never fall back to another place in the text.
 * - Only a missing or purely generic mention ("lab") lets us look for a place name elsewhere in the text.
 * - Confidential reports never block on location (they go to the admin-only queue anyway).
 */
export function decideLocation(mention: string | null, fullText: string, opts: { confidential: boolean }): LocationDecision {
  const tokens = locationTokens(mention ?? "");
  let res: LocationResolution = tokens.length ? resolveTokens(tokens) : { status: "none" };

  // Place names are looked for in the report WITHOUT its injected parts (see stripInjectedClauses).
  const cleanText = stripInjectedClauses(fullText);
  const mentionIsUsable = tokens.length > 0 && !isGenericOnly(tokens);
  if (!mentionIsUsable && res.status !== "resolved") {
    const scanned = findLocationInText(cleanText);
    if (scanned.status === "resolved" || (scanned.status === "ambiguous" && res.status === "none")) res = scanned;
  }

  const base = { mention: mention ? clip(mention) : null };

  // A report that names two different places, or whose extracted place is not the one it names, is never guessed:
  // injected or sloppy text could otherwise steer a report to another department ("...department: Library").
  if (res.status === "resolved" && !opts.confidential) {
    const named = findAllLocationsInText(cleanText);
    if (named.length > 0 && (named.length >= 2 || named[0].id !== res.location.id)) {
      const options = [...new Map([res.location, ...named].map((l) => [l.id, l])).values()].slice(0, config.location.maxSuggestions);
      return needs(opts, { mention: null }, "ambiguous_place", options);
    }
  }
  switch (res.status) {
    case "resolved":
      return { ...base, status: "resolved", location: res.location, reason: null, question: null, suggestions: [] };
    case "ambiguous": {
      const reason: LocationReason = res.vague ? "vague_place" : "ambiguous_place";
      // a bare "lab" matches every lab: list them all, grouped by department, so the student can tell which department's lab
      const allLabs = res.vague && res.candidates.length > 1 && res.candidates.every((c) => c.type === "lab");
      const options = allLabs
        ? [...res.candidates].sort((x, y) => String(x.owner).localeCompare(String(y.owner)) || x.name.localeCompare(y.name)).slice(0, config.location.maxLabSuggestions)
        : res.candidates.slice(0, config.location.maxSuggestions);
      return needs(opts, base, reason, options);
    }
    case "unknown":
      return needs(opts, base, "unknown_place", res.suggestions);
    case "none": {
      const generic = tokens.length > 0; // mention was only "lab"/"room" and nothing found elsewhere
      const options = generic ? suggestionsFor(tokens, qualifierDepts(tokens)) : [];
      return needs(opts, base, generic ? "vague_place" : "no_location", options);
    }
  }
}

function needs(
  opts: { confidential: boolean },
  base: { mention: string | null },
  reason: LocationReason,
  options: LocationRef[],
): LocationDecision {
  if (opts.confidential) {
    return { ...base, status: "not_required", location: null, reason, question: null, suggestions: [] };
  }
  return { ...base, status: "needs_clarification", location: null, reason, question: buildQuestion(reason, base.mention, options), suggestions: options };
}
