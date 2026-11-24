// Purpose: small friendly inline-SVG illustrations for empty states and the public pages. No external assets.
// They use the palette tokens through currentColor / CSS variables, so a palette change updates them too.
import { cn } from "./cn";

export type ArtName = "inbox" | "search" | "shield" | "check" | "map" | "chat";

const stroke = "var(--color-brand-600)";
const soft = "var(--color-brand-100)";
const accent = "var(--color-accent-500)";
const accentSoft = "var(--color-accent-50)";
const ink = "var(--color-ink-soft)";

export function Art({ name, className }: { name: ArtName; className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn("h-28 w-auto", className)} role="img" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="80" cy="108" rx="52" ry="6" fill="var(--color-sunken)" />
      {name === "inbox" && (
        <>
          <rect x="30" y="34" width="100" height="64" rx="10" fill={soft} stroke={stroke} strokeWidth="2.5" />
          <path d="M30 70h30l6 10h28l6-10h30" stroke={stroke} strokeWidth="2.5" />
          <rect x="50" y="18" width="60" height="30" rx="6" fill="#fff" stroke={stroke} strokeWidth="2.5" />
          <path d="M60 28h40M60 36h26" stroke={ink} strokeWidth="2.5" />
          <circle cx="126" cy="30" r="9" fill={accent} />
          <path d="M122 30l3 3 5-6" stroke="#fff" strokeWidth="2.5" />
        </>
      )}
      {name === "search" && (
        <>
          <rect x="26" y="26" width="84" height="62" rx="10" fill="#fff" stroke={stroke} strokeWidth="2.5" />
          <path d="M40 44h40M40 56h28M40 68h34" stroke={ink} strokeWidth="2.5" opacity="0.5" />
          <circle cx="104" cy="74" r="20" fill={soft} stroke={stroke} strokeWidth="2.5" />
          <path d="M119 89l16 14" stroke={accent} strokeWidth="5" />
          <path d="M96 74h16" stroke={stroke} strokeWidth="2.5" />
        </>
      )}
      {name === "shield" && (
        <>
          <path d="M80 14l42 14v28c0 26-18 42-42 50-24-8-42-24-42-50V28l42-14z" fill={soft} stroke={stroke} strokeWidth="2.5" />
          <path d="M80 26l30 10v20c0 19-13 31-30 37-17-6-30-18-30-37V36l30-10z" fill="#fff" stroke={stroke} strokeWidth="2" opacity="0.9" />
          <rect x="68" y="54" width="24" height="20" rx="4" fill={accent} />
          <path d="M72 54v-6a8 8 0 0116 0v6" stroke={accent} strokeWidth="3" />
        </>
      )}
      {name === "check" && (
        <>
          <circle cx="80" cy="58" r="38" fill={soft} stroke={stroke} strokeWidth="2.5" />
          <path d="M62 60l13 13 25-28" stroke={stroke} strokeWidth="6" />
          <circle cx="30" cy="30" r="4" fill={accent} />
          <circle cx="132" cy="38" r="3" fill={stroke} />
          <path d="M126 22l4 4M130 22l-4 4" stroke={accent} strokeWidth="2.5" />
        </>
      )}
      {name === "map" && (
        <>
          <path d="M28 40l34-12 36 12 34-12v62l-34 12-36-12-34 12V40z" fill={soft} stroke={stroke} strokeWidth="2.5" />
          <path d="M62 28v62M98 40v62" stroke={stroke} strokeWidth="2" opacity="0.5" />
          <path d="M80 18a14 14 0 00-14 14c0 12 14 26 14 26s14-14 14-26A14 14 0 0080 18z" fill={accent} />
          <circle cx="80" cy="32" r="5" fill="#fff" />
        </>
      )}
      {name === "chat" && (
        <>
          <rect x="22" y="22" width="76" height="46" rx="12" fill="#fff" stroke={stroke} strokeWidth="2.5" />
          <path d="M40 68l-8 14 22-14" fill="#fff" stroke={stroke} strokeWidth="2.5" />
          <path d="M36 38h44M36 50h28" stroke={ink} strokeWidth="2.5" opacity="0.6" />
          <rect x="74" y="50" width="64" height="40" rx="12" fill={accentSoft} stroke={accent} strokeWidth="2.5" />
          <path d="M122 90l8 12-20-12" fill={accentSoft} stroke={accent} strokeWidth="2.5" />
          <path d="M88 64h38M88 76h24" stroke={accent} strokeWidth="2.5" />
        </>
      )}
    </svg>
  );
}
