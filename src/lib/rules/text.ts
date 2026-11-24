// Purpose: shared text helpers for deterministic rules: normalization, tokenizing, typo-tolerant matching.
// Pure functions, no I/O. Used by safety.ts, injection.ts and ai/fallback.ts.

/** Lowercase, strip diacritics, map common leetspeak, collapse 3+ repeated letters to 2, keep letters/digits/spaces. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  return n ? n.split(" ") : [];
}

export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed typos by word length: short words must match exactly (avoids "ragging" ~ "dragging"). */
export function allowedTypos(word: string): number {
  if (word.length >= 11) return 2;
  if (word.length >= 8) return 1; // 6-7 letter words (e.g. ragging) must match exactly: "dragging" is not "ragging"
  return 0;
}

/** Does a token match a keyword (exact, or within the typo budget for longer words)? */
export function tokenMatches(token: string, word: string): boolean {
  if (token === word) return true;
  const budget = allowedTypos(word);
  if (budget === 0) return false;
  return editDistance(token, word, budget) <= budget;
}

/** Index of the first token matching any keyword (typo tolerant), or -1. */
export function findToken(tokens: string[], words: readonly string[], from = 0): number {
  for (let i = from; i < tokens.length; i++) {
    for (const w of words) if (tokenMatches(tokens[i], w)) return i;
  }
  return -1;
}

export function hasToken(tokens: string[], words: readonly string[]): boolean {
  return findToken(tokens, words) !== -1;
}

// Characters that are invisible or only steer layout. Attackers put them INSIDE keywords ("chin\u200bgariyan") so a
// word-matching safety net no longer sees the word. Stripped before any matching.
const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;
// ZWNJ/ZWJ are legitimate in Urdu script, but between two Latin letters they can only be a disguise.
const JOINER_IN_LATIN = /(?<=[A-Za-z])[\u200c\u200d](?=[A-Za-z])/g;
// Cyrillic / Greek letters that look like Latin ones.
const CONFUSABLE: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x", "\u0456": "i", "\u0455": "s", "\u0458": "j", "\u0501": "d", "\u04bb": "h", "\u043a": "k", "\u043c": "m", "\u0442": "t",
  "\u0410": "A", "\u0415": "E", "\u041e": "O", "\u0420": "P", "\u0421": "C", "\u0425": "X", "\u0406": "I", "\u041a": "K", "\u041c": "M", "\u0422": "T", "\u0412": "B", "\u041d": "H",
  "\u03b1": "a", "\u03bf": "o", "\u03c1": "p", "\u03b9": "i", "\u03bd": "v", "\u03c5": "u", "\u0391": "A", "\u0395": "E", "\u039f": "O", "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u03a4": "T", "\u0392": "B", "\u0397": "H", "\u03a1": "P", "\u03a7": "X", "\u03a5": "Y", "\u0396": "Z",
};
const NON_LATIN_LOOKALIKE = /[\u0370-\u03ff\u0400-\u04ff]/;
/** Within a word that mixes Latin letters with Cyrillic/Greek ones, map the look-alikes back to Latin. */
function foldConfusables(text: string): string {
  return text.replace(/\S+/g, (word) => {
    if (!/[A-Za-z]/.test(word) || !NON_LATIN_LOOKALIKE.test(word)) return word;
    return word.replace(/[\u0370-\u03ff\u0400-\u04ff]/g, (ch) => CONFUSABLE[ch] ?? ch);
  });
}

/** Remove control and invisible characters, fold look-alike letters, normalise whitespace, cap length. Report text is treated as data only. */
export function sanitizeReportText(raw: string, maxChars: number): string {
  return foldConfusables(raw.normalize("NFKC").replace(INVISIBLE, "").replace(JOINER_IN_LATIN, ""))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

/** True when the text has at least one letter or digit in any script (not just punctuation, emoji or invisible characters). */
export function hasReadableContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}
