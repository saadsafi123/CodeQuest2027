// Purpose: compact progress indicator Reported -> In progress -> Resolved -> Confirmed (text on every step).
import { Check } from "lucide-react";
import { cn } from "@/components/ui";

const STEPS = ["Reported", "In progress", "Resolved", "Confirmed"];
const INDEX: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, reopened: 0, closed: 3 };

export function StatusSteps({ status }: { status: string }) {
  const at = INDEX[status] ?? 0;
  return (
    <ol className="flex items-center gap-1" aria-label={`Progress: ${STEPS[at]}${status === "reopened" ? " (reopened)" : ""}`}>
      {STEPS.map((label, i) => {
        const done = i < at || (status === "closed" && i <= at);
        const current = i === at && status !== "closed";
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("h-1.5 rounded-full transition-colors", done || current ? (status === "reopened" ? "bg-warn-600" : "bg-brand-500") : "bg-line")} />
            <span className={cn("flex items-center gap-0.5 truncate text-[11px] font-semibold", done || current ? "text-ink-soft" : "text-muted/70")}>
              {done && <Check className="size-3 shrink-0" aria-hidden />}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
