import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "soft" | "onDark" | "outlineDark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-ctl)] font-medium transition-colors duration-150 disabled:opacity-55 disabled:cursor-not-allowed select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover border border-brand",
  secondary: "bg-surface text-ink border border-control hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken border border-transparent",
  danger: "bg-priority-critical-fg text-on-brand border border-priority-critical-fg hover:opacity-90",
  accent: "bg-accent text-on-brand border border-accent hover:opacity-90",
  soft: "bg-brand-subtle text-brand hover:bg-sunken border border-transparent",
  /** on a brand-coloured band: white button / outlined button */
  onDark: "bg-surface text-brand hover:bg-brand-subtle border border-surface",
  outlineDark: "text-on-brand border border-on-brand hover:bg-brand-hover",
};
// min heights give a 44px touch target on phones (sm and md relax from the sm breakpoint up)
const sizes: Record<Size, string> = { sm: "min-h-11 px-3 text-sm sm:min-h-8", md: "min-h-11 px-4 text-sm sm:min-h-10", lg: "min-h-12 px-6 text-base" };

interface Common {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export function buttonClass({ variant = "primary", size = "md", className }: Common = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  loading,
  children,
  disabled,
  ...rest
}: Common & { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonClass({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ variant, size, className, href, children }: Common & { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass({ variant, size, className })}>
      {children}
    </Link>
  );
}
