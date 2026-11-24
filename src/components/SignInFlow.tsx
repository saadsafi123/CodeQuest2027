"use client";
// Purpose: passwordless sign in. Step 1: pick a role. Step 2: pick an account. Reuses POST /api/auth/switch.
// (Demo access: there is deliberately no password, as the judging brief requires one-click switching.)
import { ArrowLeft, ArrowRight, ClipboardList, GraduationCap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, cn, useToast } from "@/components/ui";
import { DEPARTMENT_NAMES } from "@/lib/departments";

export interface SignInUser {
  id: string;
  name: string;
  role: "student" | "staff" | "admin";
  department: string | null;
  trustScore: number;
}
type Role = SignInUser["role"];

const ROLES: { role: Role; title: string; text: string; icon: typeof GraduationCap; tone: string }[] = [
  { role: "student", title: "Student", text: "Report problems, track them, vote on fixes.", icon: GraduationCap, tone: "bg-brand-50 text-brand-700 group-hover:bg-brand-100" },
  { role: "staff", title: "Department staff", text: "Work your department's queue.", icon: ClipboardList, tone: "bg-info-50 text-info-600 group-hover:bg-info-100" },
  { role: "admin", title: "Admin", text: "Oversee campus and confidential reports.", icon: ShieldCheck, tone: "bg-accent-50 text-accent-600 group-hover:bg-accent-100" },
];
const HOME = { student: "/student", staff: "/staff", admin: "/admin" } as const;

export function SignInFlow({ users, currentId }: { users: SignInUser[]; currentId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn(u: SignInUser) {
    setBusy(u.id);
    const res = await fetch("/api/auth/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id }) }).catch(() => null);
    if (!res?.ok) {
      setBusy(null);
      return toast({ tone: "error", title: "Could not sign in", body: "Check the database status in the judge tools." });
    }
    router.push(HOME[u.role]);
    router.refresh();
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
        <p className="font-semibold">No accounts yet</p>
        <p className="mt-1 text-sm text-muted">Open the judge tools (press J) and choose Reset all data to load the demo accounts, or <Link href="/signup" className="font-semibold text-brand-700 underline">create a student</Link>.</p>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label="Choose your role">
        {ROLES.map((r) => (
          <button key={r.role} type="button" onClick={() => setRole(r.role)} className="group rf-lift rounded-2xl border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)]">
            <span className={cn("grid size-12 place-items-center rounded-xl transition-colors", r.tone)}><r.icon className="size-6" aria-hidden /></span>
            <p className="mt-4 font-display text-xl font-semibold">{r.title}</p>
            <p className="mt-1 text-sm text-ink-soft">{r.text}</p>
            <p className="mt-4 flex items-center gap-1 text-sm font-semibold text-brand-700">Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></p>
          </button>
        ))}
      </div>
    );
  }

  const list = users.filter((u) => u.role === role);
  const meta = ROLES.find((r) => r.role === role)!;
  return (
    <div>
      <button type="button" onClick={() => setRole(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Change role</button>
      <h2 className="mb-1 font-display text-2xl font-semibold">Sign in as {meta.title.toLowerCase()}</h2>
      <p className="mb-4 text-sm text-muted">Choose an account. One click, no password.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => signIn(u)}
              className={cn("group rf-lift flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left shadow-[var(--shadow-card)] disabled:opacity-60", currentId === u.id ? "border-brand-500 ring-2 ring-brand-100" : "border-line")}
            >
              <Avatar name={u.name} seed={u.id} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{u.name.replace(" (new account)", "")}</span>
                <span className="block truncate text-sm text-muted">
                  {u.role === "student" ? `Trust score ${Math.round(u.trustScore)}${u.name.includes("new account") ? " · new account" : ""}` : u.role === "staff" ? (DEPARTMENT_NAMES[u.department ?? ""] ?? u.department) : "Sees everything, including confidential reports"}
                </span>
              </span>
              <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
