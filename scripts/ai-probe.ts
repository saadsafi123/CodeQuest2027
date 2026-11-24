// Purpose: `npm run ai:probe` tests every GEMINI_API_KEYS key against candidate Flash models and prints a
// key x model table (ok / 404 / 429 / 403 / 503 ...), then recommends GEMINI_MODELS for .env.local.
// Keys are only ever printed masked. This script does not edit any file.
import { config } from "../src/lib/config";
import { parseKeys } from "../src/lib/ai/keyPool";
import { thinkingFor } from "../src/lib/ai/client";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const SEED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];
const MAX_MODELS = 12;
const TIMEOUT_MS = 20_000;

const keys = parseKeys(process.env.GEMINI_API_KEYS);
const mask = (i: number) => `key#${i + 1} (…${keys[i].slice(-4)})`;

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, body, ms: Date.now() - t0 };
  } catch (e) {
    return { status: (e as Error).name === "AbortError" ? 408 : 0, body: null, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Newer Flash models advertised by the list-models endpoint (text generation only). */
async function discoverModels(key: string): Promise<string[]> {
  const found: string[] = [];
  let token = "";
  for (let page = 0; page < 5; page++) {
    const r = await fetchJson(`${BASE}/models?pageSize=200${token ? `&pageToken=${token}` : ""}&key=${key}`);
    const b = r.body as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string } | null;
    if (r.status !== 200 || !b?.models) break;
    for (const m of b.models) {
      const name = m.name.replace(/^models\//, "");
      if (!/flash/i.test(name)) continue;
      if (/omni|image|tts|live|audio|embedding|robotics|computer|thinking-exp|learnlm|gemma|-001$|-002$|exp/i.test(name)) continue;
      if (!m.supportedGenerationMethods?.includes("generateContent")) continue;
      found.push(name);
    }
    if (!b.nextPageToken) break;
    token = b.nextPageToken;
  }
  return found;
}

async function probe(key: string, model: string) {
  const r = await fetchJson(`${BASE}/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with the JSON {"ok":true}' }] }],
      generationConfig: { maxOutputTokens: 64, temperature: 0, responseMimeType: "application/json", ...thinkingFor(model) },
    }),
  });
  const label = r.status === 200 ? "ok" : r.status === 0 ? "net" : String(r.status);
  return { label, ms: r.ms };
}

async function main() {
  if (!keys.length) {
    console.log("GEMINI_API_KEYS is empty. Put your comma-separated keys in .env.local first.");
    return;
  }
  console.log(`Probing ${keys.length} keys...`);
  const discovered = new Set<string>();
  for (const found of await Promise.all(keys.slice(0, 3).map(discoverModels))) found.forEach((m) => discovered.add(m));
  const models = [...new Set([...SEED_MODELS, ...[...discovered].sort().reverse()])].slice(0, MAX_MODELS);
  console.log(`Models: ${models.join(", ")}\n`);

  // One request per key at a time (polite), keys in parallel.
  const grid: Record<string, { label: string; ms: number }>[] = keys.map(() => ({}));
  await Promise.all(
    keys.map(async (k, i) => {
      for (const m of models) grid[i][m] = await probe(k, m);
    }),
  );

  const w = Math.max(...models.map((m) => m.length), 10);
  console.log(["key".padEnd(16), ...models.map((m) => m.padEnd(w))].join(" | "));
  console.log("-".repeat(16 + models.length * (w + 3)));
  keys.forEach((_, i) => console.log([mask(i).padEnd(16), ...models.map((m) => grid[i][m].label.padEnd(w))].join(" | ")));

  // A model that answers slower than the app's per-call timeout is useless in practice (the pool gives up on it), so
  // "usable" = answered ok within config.ai.callTimeoutMs.
  const limit = config.ai.callTimeoutMs;
  const stats = models.map((m) => {
    const cells = keys.map((_, i) => grid[i][m]);
    const oks = cells.filter((c) => c.label === "ok");
    const usable = oks.filter((c) => c.ms <= limit).length;
    const rate = cells.filter((c) => c.label === "429").length;
    const avg = oks.length ? Math.round(oks.reduce((a, c) => a + c.ms, 0) / oks.length) : 0;
    return { m, ok: oks.length, usable, rate, avg };
  });
  console.log(`
Model summary (ok keys / usable within ${limit} ms / 429 keys / avg latency of ok answers):`);
  for (const s of stats) console.log(`  ${s.m.padEnd(w)}  ok ${s.ok}/${keys.length}  usable ${s.usable}  429 ${s.rate}  ${s.avg ? `${s.avg} ms` : "-"}`);

  // 429 means the key exists but is out of quota right now: still usable later, so it counts as half.
  const ranked = stats
    .map((s) => ({ ...s, score: s.usable + s.rate * 0.5 }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.avg || 1e9) - (b.avg || 1e9));
  console.log("");
  if (!ranked.length) {
    console.log("No key answers fast enough with any candidate model right now (403/404/503/slow everywhere). The app will use fallback mode.");
    console.log("Re-run later (503 = overloaded) or create new keys in new Google Cloud projects.");
    return;
  }
  const best = ranked[0];
  console.log(`Recommended GEMINI_MODEL=${best.m}`);
  console.log("Best for rotation across keys AND models (.env.local):");
  console.log(`GEMINI_MODELS=${ranked.slice(0, 3).map((s) => s.m).join(",")}`);
  console.log("Order = preference. Quotas are per model, so a second model adds headroom when the first hits 429.");
  console.log("Gemini load changes through the day (a model can be fast now and overloaded in an hour): re-run this before the demo.");
}

main().catch((e) => {
  console.error("probe failed:", (e as Error).message);
  process.exit(123);
});