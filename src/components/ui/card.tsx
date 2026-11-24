import Link from "next/link";
import { cn } from "./cn";

/** Flat panel: 1px hairline, no shadow. Do not nest a Card inside a Card. */
export function Card({ className, children, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { /** border highlight for clickable cards */ interactive?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface", interactive && "transition-colors hover:border-control", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-snug">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export interface Crumb {
  label: string;
  href?: string;
}
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="text-brand underline-offset-2 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Breadcrumbs, one serif page title, one plain description line, actions on the right. */
export function PageHeader({ title, description, actions, crumbs }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; crumbs?: Crumb[] }) {
  return (
    <header className="mb-5">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1>{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}

/** One bordered strip with several figures, instead of a row of separate tiles. */
export function SummaryStrip({ items }: { items: { label: string; value: React.ReactNode; hint?: string; info?: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 rounded-[var(--radius-card)] border border-line bg-surface sm:flex sm:divide-x sm:divide-line">
      {items.map((it, i) => (
        <div key={it.label} className={cn("min-w-0 flex-1 px-4 py-3", i % 2 === 1 && "border-l border-line sm:border-l-0", i >= 2 && "border-t border-line sm:border-t-0")}>
          <dt className="flex items-center gap-1 text-xs text-muted">
            {it.label}
            {it.info}
          </dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{it.value}</dd>
          {it.hint && <p className="text-xs text-muted">{it.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
