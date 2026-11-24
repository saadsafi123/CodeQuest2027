// Guard: colours live ONLY in src/app/globals.css. No colour literals, no gradients and no Tailwind default palette classes
// (bg-white, text-white, bg-red-500 ...) anywhere else in src/. Files that are not migrated to the new design yet are listed in
// NOT_MIGRATED; the list only shrinks and must be EMPTY when the redesign is finished.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");
const NOT_MIGRATED = [
  "app/design/page.tsx",
  "app/page.tsx",
  "app/staff/page.tsx",
  "components/PlaceQuestion.tsx",
  "components/ui/illustrations.tsx",
];
// Next.js needs a literal for <meta name="theme-color"> (viewport export): the single allowed exception.
const EXEMPT = ["app/layout.tsx", "app/globals.css"];

const PATTERNS: [string, RegExp][] = [
  ["hex colour", /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{3}\b(?![\w-])/],
  ["rgb/hsl colour", /\b(rgba?|hsla?)\(/],
  ["gradient", /gradient/i],
  ["tailwind default palette", /\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-[0-9]+)?(\/[0-9]+)?\b/],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(f)) out.push(full);
  }
  return out;
}
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");

describe("colour literals live only in globals.css", () => {
  const offenders = new Map<string, string[]>();
  for (const f of walk(SRC)) {
    const r = rel(f);
    if (EXEMPT.includes(r)) continue;
    const text = readFileSync(f, "utf8");
    const hits = PATTERNS.filter(([, re]) => re.test(text)).map(([n]) => n);
    if (hits.length) offenders.set(r, hits);
  }

  it("no migrated file contains a colour literal, gradient or default Tailwind colour", () => {
    const bad = [...offenders.keys()].filter((r) => !NOT_MIGRATED.includes(r));
    expect(bad, `new offenders: ${bad.map((b) => `${b} (${offenders.get(b)})`).join(", ")}`).toEqual([]);
  });

  it("the NOT_MIGRATED list has no stale entries (remove files once they are clean)", () => {
    const stale = NOT_MIGRATED.filter((r) => !offenders.has(r));
    expect(stale, `already clean, remove from NOT_MIGRATED: ${stale.join(", ")}`).toEqual([]);
  });

  it("globals.css has no gradients (flat design)", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8").replace(/\.rf-skeleton \{[^}]*\}/, "");
    expect(css).not.toMatch(/(?<!-)gradient\(/);
  });
});
