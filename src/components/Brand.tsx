// Purpose: the university identity block: a simple crest-style mark, the university name (serif) and the service name.
// All text comes from src/lib/brand.ts (placeholders until the real university details are filled in).
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/components/ui";

export function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 36" className={cn("h-9 w-8 shrink-0 text-brand", className)} aria-hidden>
      <path d="M16 1.5 3 6v11c0 8.2 5.4 14.4 13 17.5C23.600 31.400 29 25.200 29 17V6L16 1.500Z" fill="currentColor" />
      <path d="M9 12.500h14M9 17.500h14M9 22.500h9" stroke="var(--on-brand)" strokeWidth="1.800" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Brand({ href = "/", compact, className }: { href?: string; compact?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("flex min-w-0 items-center gap-3", className)} aria-label={`${BRAND.universityName}: ${BRAND.serviceName}`}>
      <Crest />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-serif text-lg font-semibold text-ink">{BRAND.universityName}</span>
        {!compact && <span className="block truncate text-xs text-muted">{BRAND.serviceName}</span>}
      </span>
    </Link>
  );
}
