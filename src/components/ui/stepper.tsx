// Purpose: a numbered step indicator (report wizard, "how it works"). Presentation only.
import { Check } from "lucide-react";
import { cn } from "./cn";

export interface StepItem {
  label: string;
  hint?: string;
}

/** `current` is the 0-based index of the active step; earlier steps show a check mark. */
export function Stepper({ steps, current, className }: { steps: StepItem[]; current: number; className?: string }) {
  return (
    <ol className={cn("grid gap-3", className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} aria-current={active ? "step" : undefined} className="min-w-0">
            <div className={cn("h-1 rounded-[2px] transition-colors", done || active ? "bg-brand" : "bg-line")} />
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  done ? "bg-brand text-on-brand" : active ? "bg-brand-subtle text-brand ring-2 ring-brand" : "bg-sunken text-muted",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("truncate text-sm font-semibold", active || done ? "text-ink" : "text-muted")}>{s.label}</span>
            </div>
            {s.hint && <p className="mt-0.5 hidden pl-8 text-xs text-muted sm:block">{s.hint}</p>}
          </li>
        );
      })}
    </ol>
  );
}
