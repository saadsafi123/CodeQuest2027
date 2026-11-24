// Purpose: deterministic safety nets over the raw report text. They run even if the AI fails, is blocked or is fooled.
//  - detectSafetyHazard: fire / sparks / gas / smoke / shock / medical / structural (English + Roman Urdu, typo tolerant)
//  - detectHarassment:   harassment / ragging / bullying / threats (sets the CONFIDENTIAL flag)
// Nets can only RAISE (set a hazard / confidential flag); nothing here ever lowers severity.
// Tone is ignored: CAPS, "!!!" and the word "urgent" are not inputs.
import { findToken, hasToken, normalizeText, tokenMatches, tokenize } from "./text";

export type HazardType = "fire" | "sparks" | "gas" | "smoke" | "shock" | "medical" | "structural";

export interface SafetyNetResult {
  hazard: boolean;
  /** Most severe type first. */
  types: HazardType[];
  /** What matched (normalized text, for explanations/debugging; never contains identity). */
  matched: string[];
}

interface HazardRule {
  type: HazardType;
  /** Single-token keywords (typo tolerance applies to words of 6+ letters). */
  words: readonly string[];
  /** Regexes over normalized text, for multi-word phrases. */
  phrases: readonly RegExp[];
}

// Order = severity order used to pick the primary type.
const HAZARD_RULES: readonly HazardRule[] = [
  {
    type: "fire",
    words: ["fire", "fires", "flame", "flames", "blaze", "burning", "burnt", "aag", "agg", "aagg", "ablaze", "inferno"],
    phrases: [/(?<!\b(?:nahi|nhi|nai|not|no) )\bjal (raha|rahi|rahe|gaya|gayi|gaye)\b/, /\bjalne (lagi|laga|lagay)\b/, /\bfire lag/, /\baag lag/, /\bcaught fire\b/, /\bon fire\b/],
  },
  {
    type: "gas",
    words: ["gas", "gass", "lpg", "methane", "cylinder", "cylinders"],
    phrases: [/\bgas (leak|leakage|smell|ki|se)\b/, /\b(leak|smell|boo|bu|sungh) .{0,10}gas\b/],
  },
  {
    type: "shock",
    words: ["electrocuted", "electrocution", "electrocute", "jhatka", "jhatke", "jhatkay"],
    phrases: [
      /\b(electric|electrical) shock/,
      /\bshock (lag|laga|lagi|lagta|from|when|while)/,
      /\bgot (an? )?(electric )?shock/,
      /\bcurrent (lag|laga|lagi|lagta|lagg|maar)/,
      /\bbijli (ka|ke) (jhatka|jhatke|current)/,
      /\bshocked by\b/,
    ],
  },
  {
    type: "sparks",
    words: ["spark", "sparks", "sparking", "sparked", "sparkes", "sparcs", "sprks", "chingari", "chingariyan", "chingarian", "chingarya", "chingri", "chingariya"],
    phrases: [/\bshort ?circuit/, /\bshort sarkit/, /\bwire.{0,15}(jal|burn|melt|pighl)/, /\btar (jal|garam|pighl)/],
  },
  {
    type: "smoke",
    words: ["smoke", "smokey", "smoky", "dhuan", "dhuaan", "dhua", "dhuwan", "dhwan", "dhoan", "dhuwa", "fumes"],
    phrases: [
      /\b(socket|plug|wire|wires|switch|switchboard|ac|fan|machine|board|ups|pc|computer|projector|heater|geyser|stove|chulha) (is |was |ki |ka )?(smoking|dhuan)/,
      /\bsmoking (socket|plug|wire|wires|switch|switchboard|ac|fan|machine|board|ups|pc|computer|projector|heater|geyser)/,
      /\bburning (smell|odor|odour)/,
      /\bsmell(s|ing)? (of )?(burn|burning|burnt|plastic burning)/,
      /\b(jalne|jalay|jale) (ki|hue) (boo|bu|smell)/,
      /\bjalne ki (boo|bu|smell)/,
    ],
  },
  {
    type: "medical",
    words: [
      "fainted",
      "fainting",
      "faint",
      "unconscious",
      "seizure",
      "seizures",
      "bleeding",
      "ambulance",
      "injured",
      "injury",
      "choking",
      "behosh",
      "bayhosh",
      "beheosh",
      "bahosh",
      "khoon",
      "unconcious",
      "paramedic",
    ],
    phrases: [
      /\bpassed out\b/,
      /\bheart attack\b/,
      /\bdil ka (daura|dora)\b/,
      /\bmedical (emergency|help|aid|attention|issue)\b/,
      /\bcan t breathe\b/,
      /\bcannot breathe\b/,
      /\bsaans (nahi|nhi|lene|band)/,
      /\bchakkar (kha|aa|a raha)/,
      /\basthma attack\b/,
      /\ballergic reaction\b/,
      /\b(bahut|buht|bohat) khoon\b/,
      /\bcollapsed\b.{0,20}\b(student|girl|boy|person|teacher|sir|madam)\b|\b(student|girl|boy|person|teacher|sir|madam)\b.{0,20}\bcollapsed\b/,
      /\bgir (gaya|gayi|gaye) (aur|or) behosh/,
    ],
  },
  {
    type: "structural",
    words: [],
    phrases: [
      /\b(ceiling|roof|chhat|chat|chhath|wall|dewar|diwar|beam|pillar) (is |was )?(fell|fall|falling|collapse|collapsed|collapsing|gir|gira|giri|giray|gir raha|gir rahi|toot|tut)/,
      /\b(ceiling|roof|wall|chhat|diwar|dewar) (me|mein|main|par)? ?(crack|daraar|dararen)\b/,
    ],
  },
];

const NEGATION_BEFORE = new Set(["no", "not", "without", "never", "zero"]);
const NEGATION_AFTER = new Set(["nahi", "nhi", "nai", "nahin", "nae", "ni"]);
// real words that are within one typo of a hazard word but mean something else
const LOOKALIKES = new Set(["sparkling", "burnt out", "smokers"]);
const NOT_A_HAZARD_AFTER = new Set(["drill", "drills"]); // "fire drill" is an exercise, not a fire

export function detectSafetyHazard(text: string): SafetyNetResult {
  const norm = normalizeText(text);
  const tokens = tokenize(text);
  const types: HazardType[] = [];
  const matched: string[] = [];

  for (const rule of HAZARD_RULES) {
    let hit: string | null = null;

    for (let i = 0; i < tokens.length && !hit; i++) {
      if (LOOKALIKES.has(tokens[i])) continue;
      for (const w of rule.words) {
        if (!tokenMatches(tokens[i], w)) continue;
        const prev = tokens[i - 1];
        const next = tokens[i + 1];
        if (prev && NEGATION_BEFORE.has(prev)) continue;
        if (next && (NEGATION_AFTER.has(next) || NOT_A_HAZARD_AFTER.has(next))) continue;
        hit = tokens[i];
        break;
      }
    }
    if (!hit) {
      for (const re of rule.phrases) {
        const m = re.exec(norm);
        if (m) {
          hit = m[0];
          break;
        }
      }
    }
    if (hit) {
      types.push(rule.type);
      matched.push(`${rule.type}:${hit}`);
    }
  }
  return { hazard: types.length > 0, types, matched };
}

// ------------------------------------------------------------------ harassment

export interface HarassmentNetResult {
  confidential: boolean;
  matched: string[];
}

const HARASSMENT_WORDS = [
  "harass",
  "harassed",
  "harassing",
  "harassment",
  "harasment",
  "harrasment",
  "harrassment",
  "ragging",
  "ragged",
  "raggin",
  "ragin",
  "bully",
  "bullying",
  "bullied",
  "bullies",
  "stalk",
  "stalked",
  "stalking",
  "stalker",
  "molest",
  "molested",
  "molestation",
  "blackmail",
  "blackmailing",
  "blackmailed",
  "threaten",
  "threatened",
  "threatening",
  "threats",
  "intimidate",
  "intimidating",
  "intimidation",
  "dhamki",
  "dhamkiyan",
  "dhamkaya",
  "dhamkata",
  "dhamka",
  "groped",
  "grope",
  "assaulted",
  "assault",
  "abused",
  "abusive",
  "chedkhani",
  "chherta",
  "chherte",
  "chhera",
  "chherna",
  "chhedna",
  "chhed",
  "hawas",
  "hawaskar",
] as const;

const PERSON_CONTEXT = ["senior", "seniors", "junior", "juniors", "fresher", "freshers", "batch", "batchmates", "classmate", "teacher", "sir", "madam", "professor", "ustad", "ladke", "ladkay", "larkay", "boys", "log"];
const RAGGING_AMBIGUOUS = ["raging", "ragging", "rag"]; // "raging" needs person context

const HARASSMENT_PHRASES: readonly RegExp[] = [
  /\beve teas/,
  /\bsexual(ly)?\b/,
  /\binappropriate(ly)? (touch|comment|message|messages|behaviou?r)/,
  /\btouch(ed|ing)? me\b/,
  /\bgandi (nazar|nazrein|nazron|baat|baatein|baten|batein|harkat|harkatein)/,
  /\bgandi nazar/,
  /\b(tang|pareshan) (kar|karte|karta|karti|karna|kr)\b.{0,30}\b(senior|seniors|ladke|ladkay|larkay|boys|sir|teacher)\b/,
  /\b(senior|seniors|ladke|ladkay|larkay|boys|sir|teacher)\b.{0,30}\b(tang|pareshan) (kar|karte|karta|karti|karna|kr)/,
  /\b(senior|seniors)\b.{0,40}\b(maar|maarte|marte|peet|dhamki|force|zabardasti|beat|hit|slap|thappar)/,
  /\b(zabardasti|forcefully)\b.{0,30}\b(senior|seniors|ladke|boys)\b/,
  /\bmaar peet\b.{0,20}\b(senior|seniors)\b/,
  /\bra[gq]+(ing|in|ging)\b.{0,10}(kar|karte|ho raha|ho rahi|kr)/,
];

export function detectHarassment(text: string): HarassmentNetResult {
  const norm = normalizeText(text);
  const tokens = tokenize(text);
  const matched: string[] = [];

  const i = findToken(tokens, HARASSMENT_WORDS);
  if (i !== -1) matched.push(`word:${tokens[i]}`);

  // "raging"/"rag" typo of "ragging": only counts alongside a person/context word (avoids "raging fire").
  if (matched.length === 0) {
    const r = tokens.findIndex((t) => RAGGING_AMBIGUOUS.includes(t));
    if (r !== -1 && hasToken(tokens, PERSON_CONTEXT)) matched.push(`word:${tokens[r]}+context`);
  }
  for (const re of HARASSMENT_PHRASES) {
    const m = re.exec(norm);
    if (m) matched.push(`phrase:${m[0]}`);
  }
  return { confidential: matched.length > 0, matched };
}
