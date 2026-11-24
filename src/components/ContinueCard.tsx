"use client";
// Purpose: big one-click "Continue as ..." card (passwordless switch).
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, cn, useToast } from "@/components/ui";

export interface CardUser {
  id: string;
  name: string;
  role: "student" | "staff" | "admin";
  department: string | null;
  trustScore: number;
}

export function ContinueCard({ user, current }: { user: CardUser; current: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const res = await fetch("/api/auth/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    if (!res.ok) {
      setBusy(false);
      return toast({ tone: "error", title: "Could not switch user", body: "Check the database status chip at the top." });
    }
    router.push(user.role === "admin" ? "/admin" : user.role === "staff" ? "/staff" : "/student");
    router.refresh();
  }

  const sub = user.role === "student" ? `Trust score ${Math.round(user.trustScore)}` : user.role === "staff" ? `${user.department} department queue` : "Sees everything, including confidential reports";
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-card)] border bg-surface p-3.5 text-left shadow-[var(--shadow-card)] transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-[var(--shadow-pop)] disabled:opacity-60",
        current ? "border-brand-500 ring-2 ring-brand-100" : "border-line",
      )}
    >
      <Avatar name={user.name} seed={user.id} size={42} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">Continue as {user.name}</span>
        <span className="block truncate text-sm text-muted">{sub}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
    </button>
  );
}
