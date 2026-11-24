import { PRIORITY_CLASS, STATUS_CLASS, priorityLabel, statusLabel as label } from "@/lib/labels";
import { cn } from "./cn";

type Tone = "neutral" | "brand" | "danger" | "warn" | "ok" | "info" | "accent";
const tones: Record<Tone, string> = {
  neutral: STATUS_CLASS.closed,
  brand: STATUS_CLASS.open,
  danger: PRIORITY_CLASS.critical,
  warn: STATUS_CLASS.in_progress,
  ok: STATUS_CLASS.resolved,
  info: PRIORITY_CLASS.medium,
  accent: STATUS_CLASS.reopened,
};

const shape = "inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-2 py-0.5 text-xs font-medium leading-5";

/** Small rectangular label. Always carries text (never colour alone). */
export function Badge({ tone = "neutral", icon, className, children }: { tone?: Tone; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(shape, tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn(shape, PRIORITY_CLASS[priority] ?? PRIORITY_CLASS.low)}>
      <span className="sr-only">Priority: </span>
      {priorityLabel(priority)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(shape, STATUS_CLASS[status] ?? STATUS_CLASS.closed)}>
      <span className="sr-only">Status: </span>
      {label(status)}
    </span>
  );
}

export { label as statusLabel };
