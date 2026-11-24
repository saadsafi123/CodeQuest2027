// Purpose: `npm run try:extract -- "<report text>"` - run one sentence through extraction + nets and print the result.
// Flags: --fallback  force the rule-based extractor (no Gemini call).
import { analyzeReport } from "@/lib/ai/analyze";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--fallback")) process.env.AI_MODE = "fallback";
  const text = args.filter((a) => a !== "--fallback").join(" ").trim();
  if (!text) {
    console.error('Usage: npm run try:extract -- [--fallback] "your report text"');
    process.exitCode = 1;
    return;
  }
  const r = await analyzeReport(text);
  console.log(`mode: ${r.mode}${r.fallbackReason ? ` (fallback reason: ${r.fallbackReason})` : ""}  attempts: ${r.attempts}`);
  console.log(JSON.stringify({ extraction: r.extraction, flags: r.flags }, null, 2));
}

main().catch((e) => {
  console.error("try:extract failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
