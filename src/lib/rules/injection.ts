// Purpose: detect prompt-injection attempts in report text. FLAG ONLY.
// The flag changes nothing about priority, routing or processing: the report is still handled as ordinary data.
// (It is recorded so staff/admin can see it, and so trust rules can use it later.)
import { normalizeText } from "./text";

export interface InjectionResult {
  detected: boolean;
  matched: string[];
}

const NORMALIZED_PATTERNS: readonly [string, RegExp][] = [
  ["ignore-instructions", /\b(ignore|disregard|forget|override|bypass|skip|overrule)\b.{0,40}\b(instruction|instructions|rules|rule|prompt|prompts|guidelines|directions|commands|policy|policies|restrictions)\b/],
  ["mark-priority", /\b(mark|set|make|rate|classify|label|treat|flag|escalate|rank|put|move)\b.{0,30}\b(critical|urgent|emergency|top|highest|p0|p1|high priority|max priority|first)\b/],
  ["set-priority", /\b(set|change|raise|increase|boost|upgrade|bump)\b.{0,20}\bpriority\b/],
  ["priority-assign", /\bpriority\b\s*(is|=|to|as)?\s*(critical|high|top|highest|p0|max|maximum)\b/],
  ["role-hijack", /\b(you are now|you are a|you re now|act as|pretend (to be|you)|roleplay|role play|dan mode|developer mode|jailbreak|do anything now)\b/],
  ["prompt-leak", /\b(reveal|show|print|repeat|output|leak|display)\b.{0,25}\b(system|your|the|hidden)\b.{0,15}\b(prompt|instructions|rules)\b/],
  ["system-prompt", /\b(system|developer) (prompt|message|instructions?)\b/],
  ["new-instructions", /\b(new|updated|real|actual) instructions?\b|\bfollow (these|my|the following) (instructions|orders|commands)\b/],
  ["force-routing", /\b(route|send|assign|forward|redirect) (this|it|the report)\b.{0,20}\b(to|into)\b/],
  ["force-status", /\b(mark|set|close|approve|confirm|resolve) (this|it|my|the) (issue|report|complaint|ticket)?\b.{0,15}\b(as )?(resolved|fixed|closed|done|confirmed|approved)\b/],
  ["trust-manipulation", /\b(increase|raise|boost|set|give me|max)\b.{0,15}\b(my )?(trust|score|credibility)\b/],
  // Roman Urdu / mixed
  ["ur-ignore", /\b(pichl[ie]|purani|pehle wali|upar wali|saari|sari)\b.{0,25}\b(hidayat|hidayaat|instructions?|rules|hukam|ahkam)\b/],
  ["ur-ignore-2", /\b(instructions?|rules|hidayat|hidayaat|hukam)\b.{0,15}\b(ignore|nazar andaz|bhool|bhul|bhoolo|mat maano|mat mano)\b/],
  ["ur-ignore-3", /\b(ignore|nazar andaz|bhool jao|bhul jao)\b.{0,25}\b(instructions?|rules|hidayat|hidayaat|hukam)\b/],
  ["ur-mark", /\b(critical|urgent|top|highest|high)\b.{0,20}\b(mark|set|kar do|kardo|karo|kar dein|kr do)\b/],
  ["ur-mark-2", /\b(mark|set)\b.{0,15}\b(critical|urgent|top priority)\b/],
  ["ur-priority", /\bpriority\b.{0,15}\b(high|critical|top|upar)\b.{0,15}\b(kar|karo|kardo|kr|set)\b/],
];

const RAW_PATTERNS: readonly [string, RegExp][] = [
  ["delimiter-lookalike", /<\s*\/?\s*(report_text|system|assistant|user|instructions?|prompt)\s*>/i],
  ["code-fence-role", /```\s*(system|assistant|json)\b/i],
  ["chat-role-prefix", /(^|\n)\s*(system|assistant|developer)\s*:/i],
];

export function detectInjection(text: string): InjectionResult {
  const norm = normalizeText(text);
  const matched: string[] = [];
  for (const [id, re] of NORMALIZED_PATTERNS) if (re.test(norm)) matched.push(id);
  for (const [id, re] of RAW_PATTERNS) if (re.test(text)) matched.push(id);
  return { detected: matched.length > 0, matched };
}

/**
 * The report text WITHOUT its injected parts: JSON blobs, code fences and every sentence that matches an injection
 * pattern. Place names are looked for in this text only, so "...Route this to the Library." or
 * {"department":"Library"} can never steer where a report goes. If the whole text is injected, nothing is left and
 * the student is simply asked where the problem is.
 */
export function stripInjectedClauses(text: string): string {
  const withoutBlobs = text.replace(/```[\s\S]*?```/g, " ").replace(/\{[^{}]*\}/g, " ");
  return withoutBlobs
    .split(/(?<=[.!?;])\s+|\n+/)
    .filter((clause) => clause.trim() && !detectInjection(clause).detected)
    .join(" ")
    .trim();
}
