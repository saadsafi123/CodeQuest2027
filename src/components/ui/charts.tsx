// Purpose: tiny dependency-free SVG charts for the dashboards. Pure presentation: they draw numbers they are given.
import { cn } from "./cn";

/** A smooth little trend line with a soft area under it. `data` = one number per point (oldest first). */
export function Sparkline({ data, className, tone = "brand", label }: { data: number[]; className?: string; tone?: "brand" | "accent" | "ok"; label?: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...data);
  const pts = data.length === 1 ? [data[0], data[0]] : data;
  const x = (i: number) => (i / (pts.length - 1)) * (w - 4) + 2;
  const y = (n: number) => h - 4 - (n / max) * (h - 8);
  const line = pts.map((n, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const color = { brand: "var(--brand)", accent: "var(--accent)", ok: "var(--status-resolved-fg)" }[tone];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-9 w-full", className)} role="img" aria-label={label ?? `Trend: ${data.join(", ")}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2.6" fill={color} />
    </svg>
  );
}

export interface BarItem {
  label: string;
  value: number;
  /** Optional text shown at the end, e.g. "12 open". */
  note?: string;
  tone?: "brand" | "accent" | "info" | "warn" | "danger" | "ok";
}

const BAR_TONE: Record<NonNullable<BarItem["tone"]>, string> = {
  brand: "bg-brand",
  accent: "bg-accent",
  info: "bg-status-open-fg",
  warn: "bg-status-progress-fg",
  danger: "bg-priority-critical-fg",
  ok: "bg-status-resolved-fg",
};

/** Horizontal bars with the label and the number as TEXT (never colour alone). */
export function BarList({ items, className, emptyText = "Nothing to show yet." }: { items: BarItem[]; className?: string; emptyText?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink">{i.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{i.note ?? i.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-[2px] bg-sunken" role="img" aria-label={`${i.label}: ${i.note ?? i.value}`}>
            <div className={cn("h-full rounded-[2px] transition-all duration-500", BAR_TONE[i.tone ?? "brand"])} style={{ width: `${Math.max(4, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A circular gauge with the content (a number, an avatar) in the middle. */
export function ProgressRing({
  value,
  max = 100,
  size = 56,
  stroke = 5,
  tone = "brand",
  children,
  label,
  className,
  onDark = false,
}: {
  onDark?: boolean;
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  tone?: "brand" | "accent" | "ok" | "warn" | "danger";
  children?: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const color = onDark ? "var(--on-brand)" : { brand: "var(--brand)", accent: "var(--accent)", ok: "var(--status-resolved-fg)", warn: "var(--status-progress-fg)", danger: "var(--priority-critical-fg)" }[tone];
  const track = onDark ? "var(--brand-hover)" : "var(--surface-sunken)";
  return (
    <span className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}
