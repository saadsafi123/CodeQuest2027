"use client";
// Purpose: a small (i) that explains jargon in plain words. Opens on hover, keyboard focus and tap; closes on Escape or an
// outside click. Text comes from src/lib/helpCopy.ts (one source), or pass `children` for a one-off.
import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { HELP, type HelpTerm } from "@/lib/helpCopy";
import { cn } from "./cn";

export function InfoTip({
  term,
  children,
  label,
  align = "start",
  className,
}: {
  term?: HelpTerm;
  children?: React.ReactNode;
  /** Accessible name; defaults to "What is <title>?". */
  label?: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const entry = term ? HELP[term] : null;
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const name = label ?? `What is ${entry?.title.toLowerCase() ?? "this"}?`;
  return (
    <span ref={root} className={cn("relative inline-flex align-middle", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={name}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid size-5 place-items-center rounded-full text-muted transition-colors hover:bg-brand-subtle hover:text-brand focus-visible:bg-brand-subtle"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "rf-pop-in absolute top-full z-50 mt-1.5 w-64 max-w-[78vw] rounded-[var(--radius-card)] font-sans tracking-normal normal-case border border-line bg-surface p-3 text-left text-xs font-normal leading-relaxed text-ink shadow-[var(--shadow-pop)]",
            align === "start" && "left-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            align === "end" && "right-0",
          )}
        >
          {entry && <strong className="mb-0.5 block text-sm font-semibold text-ink">{entry.title}</strong>}
          {children ?? entry?.short}
        </span>
      )}
    </span>
  );
}
