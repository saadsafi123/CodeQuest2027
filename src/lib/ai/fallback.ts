// Purpose: rule-based extractor used when there are no Gemini keys, all keys fail/are blocked, or AI_MODE=fallback.
// Handles English, Roman Urdu and mixed text with typo tolerance. Produces the SAME shape as the AI extraction
// (zod Extraction). It never sets priority/trust/permissions and never needs the network, so the demo never dies.
// Location is only *extracted as a mention* here; validation against the gazetteer is a later step.
import { stripInjectedClauses } from "@/lib/rules/injection";
import { detectInjection } from "@/lib/rules/injection";
import { decideLocation } from "@/lib/rules/location";
import { detectHarassment, detectSafetyHazard, type HazardType } from "@/lib/rules/safety";
import { hasToken, normalizeText, tokenMatches, tokenize } from "@/lib/rules/text";
import type { Extraction } from "./schema";

type Dept = Extraction["department_guess"];
type Category = Extraction["problem_category"];

// ------------------------------------------------------------------ language

const UR_MARKERS = new Set([
  "hai", "hain", "hy", "h", "nahi", "nhi", "nai", "nahin", "ka", "ki", "ke", "ko", "mein", "mai", "se", "par", "pe", "aur", "or", "kharab", "kharaab",
  "band", "ho", "hua", "hui", "hue", "raha", "rahi", "rahe", "bohat", "bahut", "buhat", "bht", "kuch", "koi", "yeh", "ye", "wo", "woh", "abhi", "kal",
  "aaj", "pani", "bijli", "garmi", "thanda", "thandi", "nikal", "lag", "laga", "lagi", "gaya", "gayi", "gaye", "kar", "karo", "kya", "kyun", "tha", "thi",
  "sab", "wala", "wali", "wale", "chal", "chalta", "chalti", "chalte", "dhuan", "aag", "bas", "bata", "bataya", "hun", "hoon", "humein", "hamare",
  "hamari", "mera", "meri", "mujhe", "unka", "unki", "kaam", "kam", "sirf", "bhi", "toh", "to", "lekin", "magar", "jab", "tak", "wahan", "yahan", "upar",
  "neeche", "andar", "bahar", "sath", "saath", "pichle", "agle", "din", "ghante", "se", "ne", "dena", "do", "den", "karein", "kijiye", "kijye", "please",
]);
const UR_STRONG = new Set(["hai", "hain", "nahi", "nhi", "kharab", "kharaab", "raha", "rahi", "rahe", "bohat", "bahut", "mein", "wala", "wali", "aur", "ka", "ki", "ke", "ko", "pani", "bijli", "garmi", "hun", "hoon", "gaya", "gayi", "nikal", "chal", "kya", "mera", "meri", "mujhe"]);
const EN_MARKERS = new Set([
  "the", "is", "are", "was", "were", "not", "working", "in", "on", "at", "of", "and", "to", "broken", "no", "from", "it", "this", "that", "has", "have",
  "been", "there", "since", "very", "too", "please", "with", "for", "my", "our", "his", "her", "coming", "out", "again", "all", "some", "since", "day", "days",
  "hours", "yesterday", "today", "someone", "students", "student", "need", "needs", "fix", "fixed", "problem", "issue", "cannot", "cant", "doesnt", "does", "can",
]);

function detectLanguage(rawText: string, tokens: string[]): Extraction["language"] {
  if (/[؀-ۿ]/.test(rawText)) return "other";
  let ur = 0;
  let urStrong = 0;
  let en = 0;
  for (const t of tokens) {
    if (UR_MARKERS.has(t) && t !== "to" && t !== "or" && t !== "do" && t !== "h" && t !== "please") ur++;
    if (UR_STRONG.has(t)) urStrong++;
    if (EN_MARKERS.has(t) && !UR_MARKERS.has(t)) en++;
  }
  if (urStrong >= 1 && en >= 2) return "mixed";
  if (urStrong >= 1 || ur >= 2) return en >= 1 && ur <= en ? "mixed" : "roman_urdu";
  return "english";
}

// ------------------------------------------------------------------- objects

interface ObjectDef {
  name: string; // canonical English noun for the signature
  words: readonly string[];
  phrases?: readonly RegExp[];
  category: Category;
  dept: Dept; // default department when no location owner is identifiable
}

const OBJECTS: readonly ObjectDef[] = [
  { name: "water cooler", words: [], phrases: [/\bwater coolers?\b/, /\bpani (wala |ka )?cooler\b/], category: "plumbing", dept: "Cafeteria" },
  { name: "wifi", words: ["wifi", "wify", "wyfi", "wfi", "wireless", "internet", "intrnet", "network", "router", "lan", "broadband", "ethernet", "portal"], phrases: [/\bwi ?fi\b/, /\bnet (nahi|nhi|slow|down|band|chal)/], category: "network", dept: "IS" },
  { name: "projector", words: ["projector", "projectors", "projecter", "projektor", "projectr", "proyector", "beamer"], category: "equipment", dept: "CSE" },
  { name: "ac", words: ["ac", "acs", "aircon", "airconditioner", "cooling", "heater", "heating"], phrases: [/\bair ?con(ditioner|ditioning)?\b/, /\ba c\b/], category: "hvac", dept: "unknown" },
  { name: "fan", words: ["fan", "fans", "pankha", "pankhay", "pankhe", "exhaust"], category: "electrical", dept: "EE" },
  { name: "light", words: ["light", "lights", "bulb", "bulbs", "tubelight", "tube", "tubes", "lamp", "batti", "bati", "roshni", "led"], category: "electrical", dept: "EE" },
  { name: "power", words: ["bijli", "electricity", "outage", "loadshedding", "ups", "voltage", "blackout", "generator"], phrases: [/\bload shedding\b/, /\bpower (cut|outage|failure|nahi|gone)\b/, /\bno power\b/], category: "electrical", dept: "EE" },
  { name: "socket", words: ["socket", "sockets", "plug", "plugs", "switchboard", "switch", "switches", "wiring", "wire", "wires", "extension", "tar", "breaker", "transformer"], category: "electrical", dept: "EE" },
  { name: "computer", words: ["computer", "computers", "pc", "pcs", "monitor", "monitors", "keyboard", "keyboards", "mouse", "cpu", "laptop", "laptops", "screen", "screens"], category: "equipment", dept: "CSE" },
  { name: "printer", words: ["printer", "printers", "photocopier", "photocopy", "scanner", "xerox"], category: "equipment", dept: "IS" },
  { name: "lift", words: ["lift", "lifts", "elevator", "elevators"], category: "equipment", dept: "EE" },
  { name: "microphone", words: ["mic", "mics", "microphone", "speaker", "speakers", "sound", "smartboard"], category: "equipment", dept: "CSE" },
  { name: "lab equipment", words: ["oscilloscope", "multimeter", "soldering", "apparatus", "equipment", "instruments", "instrument"], category: "equipment", dept: "unknown" },
  { name: "water supply", words: ["pani", "water", "tap", "taps", "nal", "leak", "leakage", "leaking", "pipe", "pipes", "drain", "drainage", "flush", "washroom", "washrooms", "toilet", "toilets", "bathroom", "bathrooms", "sink", "tanki", "tank", "seepage"], category: "plumbing", dept: "unknown" },
  { name: "door", words: ["door", "doors", "lock", "locks", "window", "windows", "handle", "darwaza", "darwazay", "khirki", "taala", "latch"], category: "furniture", dept: "unknown" },
  { name: "furniture", words: ["chair", "chairs", "desk", "desks", "bench", "benches", "table", "tables", "kursi", "kursiyan", "whiteboard", "blackboard", "furniture", "podium"], category: "furniture", dept: "unknown" },
  { name: "food", words: ["food", "khana", "khaana", "meal", "meals", "rice", "chawal", "chicken", "biryani", "roti", "naan", "tea", "chai", "burger", "samosa", "juice", "menu", "price", "prices", "expensive", "mehnga", "mehngi", "mehnge", "stale", "hygiene", "hygienic", "kitchen", "fries", "sandwich", "drinks"], category: "food", dept: "Cafeteria" },
  { name: "books", words: ["book", "books", "kitab", "kitabein", "kitaben", "journal", "journals", "newspaper", "librarian"], category: "library_service", dept: "Library" },
  { name: "noise", words: ["noise", "noisy", "shor", "loud", "silence", "quiet"], category: "library_service", dept: "unknown" },
  { name: "seating", words: ["seat", "seats", "seating", "crowded", "overcrowded"], category: "furniture", dept: "unknown" },
  { name: "cleanliness", words: ["dirty", "clean", "cleaning", "garbage", "trash", "dustbin", "safai", "ganda", "gandi", "gande", "gandagi", "smelly", "stink", "stinks", "stinky", "badboo", "cockroach", "cockroaches", "insects", "rats", "rat", "mice", "flies", "mosquito", "mosquitoes", "dust", "dusty"], category: "cleanliness", dept: "unknown" },
];

interface ObjectHit {
  def: ObjectDef;
  pos: number;
}

function findObject(tokens: string[], norm: string): ObjectHit | null {
  const offsets: number[] = [];
  let off = 0;
  for (const t of tokens) {
    offsets.push(off);
    off += t.length + 1;
  }
  let best: ObjectHit | null = null;
  for (const def of OBJECTS) {
    let pos = Infinity;
    for (let i = 0; i < tokens.length && pos === Infinity; i++) {
      for (const w of def.words) {
        if (tokenMatches(tokens[i], w)) {
          pos = offsets[i];
          break;
        }
      }
    }
    for (const re of def.phrases ?? []) {
      const m = re.exec(norm);
      if (m && m.index < pos) pos = m.index;
    }
    if (pos !== Infinity && (!best || pos < best.pos)) best = { def, pos };
  }
  return best;
}

// -------------------------------------------------------------------- faults

type Fault = "slow" | "leaking" | "dirty" | "noisy" | "too hot" | "no supply" | "not cooling" | "not working" | "problem";

function detectFault(tokens: string[], norm: string, obj: ObjectDef | null): Fault {
  if (/\b(slow|sust|buffering|lag|lagging|disconnect|disconnecting|drops?)\b/.test(norm) && obj?.category === "network") return "slow";
  if (hasToken(tokens, ["leak", "leaks", "leaking", "leakage", "tapak", "tapakna", "tapak", "seepage", "beh", "behna", "behta", "overflow", "overflowing", "flooded", "flooding"])) return "leaking";
  if (obj?.name === "ac" && (/\b(thanda|thandi|cold|cool|cooling|thandak)\b.{0,15}\b(nahi|nhi|not|no)\b/.test(norm) || /\b(not|nahi|nhi)\b.{0,15}\b(cold|cool|cooling|thanda|thandi)\b/.test(norm) || /\bgarmi|hot|heat|sweat\w*|pasina\b/.test(norm))) return "not cooling";
  if (obj?.name === "water cooler" && /\b(not|nahi|nhi)\b.{0,15}\b(cold|thanda|thandi|chill\w*)\b|\b(thanda|thandi|cold)\b.{0,15}\b(nahi|nhi|not)\b/.test(norm)) return "not cooling";
  if (/\b(no|nahi|nhi|not|band|ruk)\b.{0,20}\b(water|pani)\b|\b(water|pani)\b.{0,20}\b(nahi|nhi|no|band|not coming|ruk|aa raha|aa rahi)\b/.test(norm)) return "no supply";
  if (obj?.category === "cleanliness" || hasToken(tokens, ["dirty", "ganda", "gandi", "gande", "gandagi", "smelly", "stink", "stinks", "stinky", "badboo", "unclean", "filthy"])) return "dirty";
  if (hasToken(tokens, ["noise", "noisy", "shor", "loud"])) return "noisy";
  if (hasToken(tokens, ["garmi", "hot", "humid", "heat", "suffocation", "suffocating", "ubas"])) return "too hot";
  if (
    hasToken(tokens, ["broken", "kharab", "kharaab", "band", "dead", "damaged", "fault", "faulty", "defective", "down", "stopped", "bekar", "toot", "tuta", "tooti", "tootay", "toota", "missing", "stolen", "gayab", "chori", "jam", "stuck"]) ||
    /\b(not|nahi|nhi|nai|doesnt|cant|cannot|isnt|wont)\b.{0,12}\b(work|working|chal|chalta|chalti|chal raha|chal rahi|on|start|kaam|run|open|load|connect|connecting)\b/.test(norm) ||
    /\b(work|working|chal|kaam|chalta|chalti)\b.{0,12}\b(nahi|nhi|nai)\b/.test(norm) ||
    /\bout of order\b/.test(norm)
  )
    return "not working";
  return obj && ["network", "electrical", "equipment", "hvac"].includes(obj.category) ? "not working" : "problem";
}

// ------------------------------------------------------------------ location

const LOC_NOUN =
  "(?:labs?|laboratory|laboratories|room|rooms|classroom|class|hall|block|building|library|cafeteria|canteen|cafe|mess|gate|parking|washrooms?|bathrooms?|toilets?|floor|ground|office|auditorium|gym|mosque|masjid|corridor|lobby|stairs|playground|department|dept)";
const LOC_QUAL = "(?:cse|cs|ee|is|it|electrical|main|central|reading|server|first|second|third|fourth|ground|upper|lower|new|old|girls|boys|ladies|gents)";
const LOC_NUM = "(?:no|number|num|#)?\\s*(?:\\d+[a-z]?|one|two|three|four|five|six|seven|eight|nine|ten)";
const LOC_OF = "(?:\\s+(?:of|in|at|ke|ki|ka|mein|me|wale|wali|inside)\\s+(?:the\\s+)?[a-z]+\\s+(?:block|building|wing|department|dept|hall|lab))";
const LOC_REGEX = new RegExp(`\\b(?:${LOC_QUAL}\\s+)?${LOC_NOUN}\\b(?:\\s+${LOC_NUM}\\b)?${LOC_OF}?`, "g");
const LOC_REGEX_NAMED_BLOCK = /\b[a-z]{2,15}\s+(?:block|building|wing)\b(?:\s+(?:no|number)?\s*\d+[a-z]?)?/g;
const LOC_STOP = new Set(["the", "is", "in", "at", "of", "this", "that", "a", "an", "my", "our", "and", "to", "from", "it", "no", "not", "ka", "ki", "ke"]);

export function extractLocationMention(rawText: string): string | null {
  // split letters from digits ("lab3" -> "lab 3") so the noun patterns can see them
  const norm = normalizeText(rawText).replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2");
  const candidates: string[] = [];
  for (const [re, stripStop] of [[LOC_REGEX, false], [LOC_REGEX_NAMED_BLOCK, true]] as const) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm))) {
      let s = m[0].trim();
      // drop a leading stop word picked up by the generic "<word> block" pattern
      const parts = s.split(" ");
      while (stripStop && parts.length > 1 && LOC_STOP.has(parts[0])) parts.shift();
      s = parts.join(" ");
      // a bare noun with nothing else is only a location for specific places
      if (/^(class|floor|ground|department|dept|hall|office|gate)$/.test(s)) continue;
      // ignore the OF-clause tail if it is just noise words
      candidates.push(s);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0].slice(0, 200);
}

function ownerFromLocation(mention: string | null, tokens: string[], text: string): Dept {
  // Same reading as the AI prompt gives Gemini: the place named in the text decides, and a lab belongs to its parent department.
  const placed = decideLocation(mention, text, { confidential: false });
  if (placed.status === "resolved" && placed.location?.owner) return placed.location.owner;
  const loc = mention ?? "";
  if (/\b(library|reading (hall|room))\b/.test(loc) || tokens.includes("library") || tokens.includes("lib")) return "Library";
  if (/\b(cafeteria|canteen|cafe|mess|food court)\b/.test(loc) || tokens.includes("cafeteria") || tokens.includes("canteen")) return "Cafeteria";
  if (/\b(cse|cs)\b/.test(loc) || /\b(cse|cs) (lab|block|room|building)\b/.test(normalizeText(tokens.join(" ")))) return "CSE";
  if (/\b(ee|electrical)\b/.test(loc) || /\b(ee|electrical) (lab|block|room|building)\b/.test(normalizeText(tokens.join(" ")))) return "EE";
  if (/\b(is|it)\s+(block|lab|room|building|dept|department)\b/.test(loc) || /\b(is|it) block\b/.test(normalizeText(tokens.join(" ")))) return "IS";
  return "unknown";
}

// ----------------------------------------------------------------- compose

const HAZARD_PHRASE: Record<HazardType, string> = {
  fire: "fire",
  sparks: "sparking",
  gas: "gas leak",
  smoke: "smoke",
  shock: "electric shock",
  medical: "medical emergency",
  structural: "structural damage",
};

function cleanForDisplay(text: string): string {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  const t = letters.length > 8 && upper / letters.length > 0.6 ? text.toLowerCase() : text;
  return t.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function extractWithRules(rawText: string): Extraction {
  const tokens = tokenize(rawText);
  const norm = normalizeText(rawText);
  const language = detectLanguage(rawText, tokens);

  const hazard = detectSafetyHazard(rawText);
  const harass = detectHarassment(rawText);
  const injection = detectInjection(rawText);

  const mention = extractLocationMention(stripInjectedClauses(rawText));
  const obj = findObject(tokens, norm)?.def ?? null;
  const fault = detectFault(tokens, norm, obj);
  const hazardType = hazard.types[0] ?? null;

  // category
  let category: Category = obj?.category ?? "other";
  if (hazardType) category = "safety";
  if (harass.confidential) category = "harassment";

  // department: owner of the place first, then the object's default. Harassment is never routed by a guess.
  let dept: Dept = "unknown";
  if (!harass.confidential) {
    const owner = ownerFromLocation(mention, tokens, stripInjectedClauses(rawText));
    if (owner !== "unknown") dept = owner;
    else dept = obj?.dept ?? "unknown";
  }

  // signature: problem only, no place
  let signature: string;
  if (harass.confidential) signature = "harassment report";
  else if (hazardType) {
    const objName = obj && !["water supply", "cleanliness"].includes(obj.name) ? obj.name : null;
    if (hazardType === "gas" || hazardType === "medical" || hazardType === "structural") signature = HAZARD_PHRASE[hazardType];
    else if (objName && ["socket", "computer", "fan", "light", "ac", "projector", "printer", "lift", "power"].includes(objName)) signature = `${objName} ${HAZARD_PHRASE[hazardType]}`;
    else signature = HAZARD_PHRASE[hazardType];
  } else if (obj) {
    const o = obj.name;
    if (fault === "no supply") signature = "no water supply";
    else if (fault === "leaking") signature = "water leak";
    else if (fault === "dirty") signature = o === "cleanliness" || o === "water supply" ? "area not clean" : `${o} dirty`;
    else if (fault === "noisy") signature = "excessive noise";
    else if (fault === "too hot") signature = o === "ac" ? "ac not cooling" : "room too hot";
    else if (o === "cleanliness") signature = "area not clean";
    else if (o === "food") signature = /\b(price|prices|expensive|mehnga|mehngi|mehnge)\b/.test(norm) ? "food prices high" : "food quality poor";
    else if (o === "books") signature = "book availability problem";
    else if (o === "noise") signature = "excessive noise";
    else if (o === "seating") signature = "not enough seating";
    else if (o === "water supply") signature = fault === "not working" ? "plumbing fault" : "water supply problem";
    else if (o === "power") signature = "no power";
    else if (o === "furniture" || o === "door") signature = `${o} broken`;
    else signature = `${o} ${fault}`;
  } else signature = "general problem";

  const safetyHazard = { is_hazard: hazardType !== null, type: (hazardType ?? "none") as Extraction["safety_hazard"]["type"] };

  const where = mention ? ` at ${mention}` : "";
  const deptText = dept === "unknown" ? "department unclear" : `belongs to ${dept}`;
  const reason = harass.confidential
    ? `Possible harassment/ragging report${where}; handled confidentially.`
    : hazardType
      ? `Safety hazard (${hazardType}) reported${where}; ${deptText}.`
      : `${capitalize(signature)}${where}; ${deptText}.`;

  return {
    language,
    normalized_text_en: cleanForDisplay(rawText),
    department_guess: dept,
    raw_location_mention: mention,
    problem_category: category,
    problem_signature: signature.slice(0, 100),
    safety_hazard: safetyHazard,
    is_harassment_or_ragging: harass.confidential,
    injection_attempt_detected: injection.detected,
    one_line_reason: reason.slice(0, 300),
    // the offline reader only knows a problem it can name; anything it files as "general problem" is unclear
    problem_is_clear: signature !== "general problem" || hazardType !== null || harass.confidential,
    follow_up_question: signature !== "general problem" || hazardType !== null || harass.confidential ? null : "What is the problem? For example: WiFi not working, AC not cooling, a broken projector.",
  };
}

/** Canonical problem object ("wifi", "ac", "projector", ...) named in a text, or null. Used by the deterministic same-problem check. */
export function detectProblemObject(text: string): string | null {
  return findObject(tokenize(text), normalizeText(text))?.def.name ?? null;
}
