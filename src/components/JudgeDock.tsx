"use client";
// Purpose: judge tools without cluttering the real UI. A small floating pill (press J) with: switch to any user, create a new
// student, reset all data, and the AI / database status. Passwordless by design (judge access requirement).
import { Gavel, RotateCcw, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Input, Skeleton, useToast } from "@/components/ui";

interface U {
  id: string;
  name: string;
  role: "student" | "staff" | "admin";
  department: string | null;
  trustScore: number;
}
const home = (r: U["role"]) => (r === "admin" ? "/admin" : r === "staff" ? "/staff" : "/student");

export function JudgeDock({ status }: { status: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<U[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/users", { cache: "no-store" }).catch(() => null);
    setUsers(res?.ok ? (await res.json()).users : []);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key.toLowerCase() === "j" && !e.metaKey && !e.ctrlKey && !e.altKey) setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open && users === null) {
      const t = setTimeout(load, 0);
      return () => clearTimeout(t);
    }
  }, [open, users, load]);

  async function switchTo(u: U) {
    setBusy(u.id);
    const res = await fetch("/api/auth/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id }) });
    setBusy(null);
    if (!res.ok) return toast({ tone: "error", title: "Could not switch user" });
    setOpen(false);
    toast({ tone: "success", title: `Now using ${u.name}`, body: u.role === "staff" ? `${u.department} staff` : u.role });
    router.push(home(u.role));
    router.refresh();
  }

  async function createStudent(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    const res = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() || undefined }) });
    setBusy(null);
    if (!res.ok) return toast({ tone: "error", title: "Could not create the student" });
    const { user } = await res.json();
    setName("");
    setUsers(null);
    setOpen(false);
    toast({ tone: "success", title: `Created ${user.name}`, body: "You are signed in as the new student." });
    router.push("/student");
    router.refresh();
  }

  async function reset() {
    setBusy("reset");
    const res = await fetch("/api/admin/reset", { method: "POST" });
    setBusy(null);
    setConfirmReset(false);
    if (!res.ok) return toast({ tone: "error", title: "Reset failed", body: "Run npm run db:check." });
    setUsers(null);
    setOpen(false);
    toast({ tone: "success", title: "All data reset", body: "Demo users were reseeded." });
    router.push("/");
    router.refresh();
  }

  const groups: [string, U["role"]][] = [["Students", "student"], ["Department staff", "staff"], ["Admin", "admin"]];
  const heading = "mb-1.5 text-xs font-semibold text-muted";
  return (
    <>
      {/* edge-docked tab: sits on the right edge, below the middle, so it never covers the main content or its actions */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Judge tools"
          className="fixed right-0 top-[62%] z-40 flex min-h-11 w-11 flex-col items-center justify-center gap-2 rounded-l-[var(--radius-card)] border border-r-0 border-brand bg-brand px-1 py-3 text-on-brand hover:bg-brand-hover md:w-9"
        >
          <Gavel className="size-4" aria-hidden />
          <span className="hidden text-xs font-medium [writing-mode:vertical-rl] md:inline">Judge tools</span>
        </button>
      )}
      {open && (
        <aside role="dialog" aria-label="Judge tools" className="rf-fade-in fixed bottom-0 right-0 top-0 z-50 flex w-[min(22rem,100vw)] flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex min-h-14 items-center justify-between border-b border-line px-4">
            <p className="flex items-center gap-2 font-semibold"><Gavel className="size-4" aria-hidden /> Judge tools</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close judge tools" className="grid size-11 place-items-center rounded-[var(--radius-ctl)] hover:bg-sunken"><X className="size-4" aria-hidden /></button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
            <section aria-label="Switch user">
              <h3 className={heading}>Switch user (one click, no password)</h3>
              {!users ? (
                <div className="space-y-1.5"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
              ) : users.length === 0 ? (
                <p className="text-priority-critical-fg">Could not load users. Use Reset all data.</p>
              ) : (
                <div className="space-y-3">
                  {groups.map(([title, role]) => {
                    const list = users.filter((u) => u.role === role);
                    if (!list.length) return null;
                    return (
                      <div key={role}>
                        <p className="mb-1 text-xs text-muted">{title}</p>
                        <ul className="grid grid-cols-2 gap-1.5">
                          {list.map((u) => (
                            <li key={u.id}>
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => switchTo(u)}
                                className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-ctl)] border border-line px-2 text-left hover:bg-sunken disabled:opacity-60"
                              >
                                <Avatar name={u.name} size={24} />
                                <span className="min-w-0 truncate text-xs font-medium">{role === "staff" ? `${u.department} staff` : u.name.replace(" (new account)", "")}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section aria-label="Create a student">
              <h3 className={heading}>New student</h3>
              <form onSubmit={createStudent} className="flex gap-2">
                <label htmlFor="dock-name" className="sr-only">Name</label>
                <Input id="dock-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name (optional)" className="min-w-0 flex-1" />
                <Button type="submit" size="md" loading={busy === "create"}><UserPlus className="size-4" aria-hidden /> Create</Button>
              </form>
            </section>
            <section aria-label="Reset all data">
              <h3 className={heading}>Reset</h3>
              {confirmReset ? (
                <div className="flex gap-2">
                  <Button variant="danger" size="md" loading={busy === "reset"} onClick={reset} className="flex-1">Yes, wipe and reseed</Button>
                  <Button variant="secondary" size="md" onClick={() => setConfirmReset(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="secondary" size="md" onClick={() => setConfirmReset(true)} className="w-full"><RotateCcw className="size-4" aria-hidden /> Reset all data</Button>
              )}
            </section>
            <section aria-label="System status" className="flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-xs text-muted">System</span>
              {status}
            </section>
            <p className="text-xs text-muted">
              <Link href="/judge" onClick={() => setOpen(false)} className="text-brand hover:underline">Full judge page</Link> · press <kbd className="rounded-[4px] border border-line bg-sunken px-1">J</kbd> to toggle
            </p>
          </div>
        </aside>
      )}
    </>
  );
}