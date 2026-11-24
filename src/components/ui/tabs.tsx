"use client";
import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

/** Controlled filter tabs (underline style). Real buttons with aria-pressed; scrolls sideways inside itself on phones. */
export function Tabs({ items, value, onChange, label }: { items: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
              active ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("rounded-[4px] px-1.5 text-xs", active ? "bg-brand-subtle text-brand" : "bg-sunken text-muted")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
