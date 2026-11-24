"use client";
// Purpose: the account menu in the header. This is the ONE place the role is shown. Sign in has no password in this demo;
// sign out just clears the cookie.
import { ChevronDown, HelpCircle, LogOut, Repeat, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, useToast } from "@/components/ui";
import { departmentName } from "@/lib/departments";
import { roleLabel } from "@/lib/labels";
import type { FrameUser } from "./AppFrame";
import { LiveTrustValue } from "./LiveTrust";

export function ProfileMenu({ user }: { user: FrameUser }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const student = user.role === "student";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    setOpen(false);
    toast({ tone: "success", title: "Signed out" });
    router.push("/");
    router.refresh();
  }

  const role = user.role === "staff" && user.department ? `${roleLabel("staff")}, ${user.department}` : roleLabel(user.role);
  const item = "flex min-h-11 items-center gap-2.5 rounded-[var(--radius-ctl)] px-3 text-sm text-ink hover:bg-sunken sm:min-h-9";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu, ${user.name}, ${role}`}
        className="flex min-h-11 items-center gap-2 rounded-[var(--radius-ctl)] px-1.5 text-left hover:bg-sunken sm:px-2"
      >
        <Avatar name={user.name} size={32} />
        <span className="hidden min-w-0 leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-medium">{user.name}</span>
          <span className="block max-w-40 truncate text-xs text-muted">{role}</span>
        </span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="rf-pop-in absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="border-b border-line p-4">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="text-sm text-muted">{user.role === "staff" ? departmentName(user.department) || role : role}</p>
            {student && (
              <p className="mt-1 text-sm text-ink">
                Trust score <LiveTrustValue initial={user.trustScore} />
              </p>
            )}
          </div>
          <div className="p-1.5">
            {student && (
              <Link role="menuitem" href="/student/trust" onClick={() => setOpen(false)} className={item}>
                <ShieldCheck className="size-4" aria-hidden /> My trust score
              </Link>
            )}
            <Link role="menuitem" href="/help" onClick={() => setOpen(false)} className={item}>
              <HelpCircle className="size-4" aria-hidden /> Help
            </Link>
            <Link role="menuitem" href="/signin" onClick={() => setOpen(false)} className={item}>
              <Repeat className="size-4" aria-hidden /> Switch account
            </Link>
            <button role="menuitem" type="button" onClick={signOut} className={`${item} w-full text-left text-priority-critical-fg`}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
