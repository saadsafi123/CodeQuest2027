// Small presentational pieces: EmptyState, Skeleton, Avatar, StatTile, Timeline, Alert. Flat, quiet, token colours only.
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";
import { Art, type ArtName } from "./illustrations";

export function EmptyState({ title, description, action, icon, art }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode; art?: ArtName }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-surface px-6 py-8 text-center">
      {icon ? <div className="mb-3 grid size-10 place-items-center rounded-[var(--radius-ctl)] bg-brand-subtle text-brand">{icon}</div> : art ? <Art name={art} className="mb-2 h-20" /> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rf-skeleton rounded-[4px]", className)} aria-hidden />;
}

/** Lines of placeholder text. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A card-shaped placeholder (title, text and a footer). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4", className)} aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <SkeletonText lines={2} />
    </div>
  );
}

const ALERT = {
  warn: "border-status-progress-border bg-status-progress-bg text-status-progress-fg",
  danger: "border-priority-critical-border bg-priority-critical-bg text-priority-critical-fg",
  info: "border-status-open-border bg-status-open-bg text-status-open-fg",
  ok: "border-status-resolved-border bg-status-resolved-bg text-status-resolved-fg",
};
export function Alert({ tone = "warn", title, children, action }: { tone?: "warn" | "danger" | "info" | "ok"; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const Icon = { warn: AlertTriangle, danger: XCircle, info: Info, ok: CheckCircle2 }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex flex-wrap items-start gap-3 rounded-[var(--radius-card)] border p-4", ALERT[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-ink">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number; seed?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.4 }} className="inline-grid shrink-0 place-items-center rounded-full bg-brand-subtle font-semibold text-brand">
      {initials}
    </span>
  );
}

/** One figure with a label. Flat: no coloured top border, no icon chip. `tone` only tints the number for risk. */
export function StatTile({ label, value, hint, tone = "neutral", info, footer }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode; tone?: "neutral" | "danger" | "warn" | "ok" | "brand"; info?: React.ReactNode; footer?: React.ReactNode }) {
  const num = { neutral: "text-ink", danger: "text-priority-critical-fg", warn: "text-status-progress-fg", ok: "text-status-resolved-fg", brand: "text-brand" }[tone];
  return (
    <div className="h-full rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <p className="flex items-center gap-1 text-sm text-muted">
        {label}
        {info}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", num)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  note?: string | null;
  tone?: "brand" | "ok" | "warn" | "neutral" | "info";
}
export function Timeline({ items }: { items: TimelineItem[] }) {
  const dot = { brand: "bg-brand", ok: "bg-status-resolved-fg", warn: "bg-status-progress-fg", neutral: "bg-control", info: "bg-status-open-fg" };
  return (
    <ol className="relative space-y-5 border-l border-line pl-6">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className={cn("absolute -left-[28px] top-1.5 size-2.5 rounded-full ring-4 ring-surface", dot[it.tone ?? "neutral"])} aria-hidden />
          <div className="text-sm font-medium">{it.title}</div>
          {it.meta && <div className="text-xs text-muted">{it.meta}</div>}
          {it.note && <p className="mt-1.5 rounded-[var(--radius-ctl)] bg-sunken px-3 py-2 text-sm text-ink">{it.note}</p>}
        </li>
      ))}
    </ol>
  );
}
