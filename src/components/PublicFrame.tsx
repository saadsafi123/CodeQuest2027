"use client";
// Purpose: header and footer for the public pages (landing, sign in, sign up, help, how decisions are made, privacy, design).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass, cn } from "@/components/ui";
import { Brand } from "./Brand";
import { SiteFooter, SlimFooter } from "./SiteChrome";
import type { FrameUser } from "./AppFrame";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/how-decisions-are-made", label: "How decisions are made" },
  { href: "/help", label: "Help" },
];

export function PublicFrame({ user, children }: { user: FrameUser | null; children: React.ReactNode }) {
  const path = usePathname();
  const home = user ? (user.role === "admin" ? "/admin" : user.role === "staff" ? "/staff" : "/student") : "/signin";
  const landing = path === "/";
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[var(--radius-ctl)] focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex min-h-14 max-w-[90rem] items-center gap-4 px-4 py-2">
          <Brand />
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-[var(--radius-ctl)] px-3 py-2 text-sm text-ink hover:bg-sunken">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link href={home} className={buttonClass({ size: "md" })}>Open my dashboard</Link>
            ) : (
              <>
                <Link href="/signin" className={cn(buttonClass({ variant: "secondary", size: "md" }))}>Sign in</Link>
                <Link href="/signup" className={cn(buttonClass({ size: "md" }), "hidden sm:inline-flex")}>Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className={cn("flex-1", landing ? "" : "mx-auto w-full max-w-6xl px-4 py-8 sm:py-10")}>
        {children}
      </main>
      {landing ? <SiteFooter /> : <SlimFooter />}
    </div>
  );
}
