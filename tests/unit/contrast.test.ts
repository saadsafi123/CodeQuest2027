// WCAG contrast guard for the design tokens in src/app/globals.css (the only file with colour values).
// Text pairs must reach 4.5:1; control borders, focus ring and non-text UI must reach 3:1. Fails the build if a token drifts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const T: Record<string, string> = {};
for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) T[m[1]] = m[2];

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const R = (a: string, b: string) => ratio(T[a], T[b]);

describe("design tokens", () => {
  it("are all defined once as hex in :root", () => {
    for (const k of ["brand", "brand-hover", "brand-subtle", "on-brand", "page", "surface", "border", "border-control", "text", "text-muted", "accent", "focus"]) expect(T[k], k).toMatch(/^#[0-9A-F]{6}$/i);
    expect(T.brand.toUpperCase()).toBe("#12355B");
    expect(T.page.toUpperCase()).toBe("#F5F7FA");
  });

  it("body, muted and accent text reach 4.5:1 on every surface they sit on", () => {
    for (const bg of ["surface", "page", "surface-sunken", "brand-subtle"]) {
      expect(R("text", bg), `text on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(R("text-muted", bg), `muted on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(R("brand", bg), `brand link on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(R("accent", "surface")).toBeGreaterThanOrEqual(4.5);
    expect(R("accent", "page")).toBeGreaterThanOrEqual(4.5);
    expect(R("on-brand", "brand")).toBeGreaterThanOrEqual(4.5);
    expect(R("on-brand", "brand-hover")).toBeGreaterThanOrEqual(4.5);
  });

  it("every priority and status badge reaches 4.5:1 (text on its own background)", () => {
    const names = ["priority-critical", "priority-high", "priority-medium", "priority-low", "status-open", "status-progress", "status-resolved", "status-confirmed", "status-reopened", "status-clarify", "status-closed"];
    for (const n of names) {
      expect(T[`${n}-fg`], n).toBeDefined();
      expect(R(`${n}-fg`, `${n}-bg`), n).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("badge text is also readable when the badge sits on the white page surface (bg vs surface is decorative, text is checked above)", () => {
    for (const n of ["priority-critical", "priority-high", "status-resolved"]) expect(R(`${n}-fg`, "surface")).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders, the focus ring and brand UI reach 3:1 (UI components, large text)", () => {
    expect(R("border-control", "surface")).toBeGreaterThanOrEqual(3);
    expect(R("border-control", "page")).toBeGreaterThanOrEqual(3);
    expect(R("focus", "surface")).toBeGreaterThanOrEqual(3);
    expect(R("focus", "page")).toBeGreaterThanOrEqual(3);
    expect(R("brand", "surface")).toBeGreaterThanOrEqual(3);
  });

  it("the contrast helper itself is right (black/white = 21, same colour = 1)", () => {
    expect(ratio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(ratio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});
