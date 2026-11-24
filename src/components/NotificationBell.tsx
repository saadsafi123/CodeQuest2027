"use client";
// Purpose: the bell in the top bar. Polls /api/notifications (derived, permission-filtered on the server) while the tab is
// visible, shows an unread badge, a dropdown, and pops a toast for a new critical issue (staff/admin) or a fix that needs
// your vote (students). "Unread" = newer than a per-browser read cursor kept in localStorage; nothing is stored on the server.
import { AlertOctagon, Bell, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn, useToast } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import type { Notice } from "@/lib/services/notificationService";

const POLL_MS = 12_000;
const ICON = { info: Info, success: CheckCircle2, warn: TriangleAlert, critical: AlertOctagon } as const;
const TONE = { info: "text-status-open-fg", success: "text-status-resolved-fg", warn: "text-status-progress-fg", critical: "text-priority-critical-fg" } as const;

export function NotificationBell({ userId, role }: { userId: string; role: "student" | "staff" | "admin" }) {
  const router = useRouter();
  const toast = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const key = `rf:read:${userId}`;
  const toastKey = `rf:toasted:${userId}`;

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const list: Notice[] = (await res.json()).notices ?? [];
      setNotices(list);
      const stored = localStorage.getItem(key);
      const read = stored ?? new Date().toISOString(); // first ever visit: everything older counts as read
      if (!stored) localStorage.setItem(key, read);
      setCursor(read);
      // toasts: each id once per browser session; on the first load only the unread critical ones (max 2)
      const shown: string[] = JSON.parse(sessionStorage.getItem(toastKey) ?? "[]");
      const wanted = list.filter((n) => !shown.includes(n.id) && (n.severity === "critical" || (n.kind === "vote_needed" && role === "student") || (!first.current && n.severity === "warn")));
      const unreadWanted = first.current ? wanted.filter((n) => n.at > read && n.severity === "critical").slice(0, 2) : wanted.filter((n) => n.at > read).slice(0, 2);
      for (const n of unreadWanted) toast({ tone: n.severity === "critical" ? "error" : "info", title: n.title, body: n.body });
      sessionStorage.setItem(toastKey, JSON.stringify([...shown, ...list.map((n) => n.id)].slice(-200)));
      first.current = false;
    } catch {
      /* offline: keep what we have */
    }
  }, [key, toastKey, role, toast]);

  useEffect(() => {
    const t0 = setTimeout(poll, 0);
    const tick = () => document.visibilityState === "visible" && void poll();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [poll]);

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

  const unread = cursor ? notices.filter((n) => n.at > cursor).length : 0;
  const critical = cursor ? notices.some((n) => n.at > cursor && n.severity === "critical") : false;

  function markAllRead() {
    const now = new Date().toISOString();
    localStorage.setItem(key, now);
    setCursor(now);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className={cn("relative grid size-11 place-items-center rounded-[var(--radius-ctl)] text-ink transition-colors hover:bg-sunken")}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className={cn("absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold leading-5 text-on-brand", critical ? "bg-priority-critical-fg" : "bg-accent")}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="rf-pop-in absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button type="button" onClick={markAllRead} disabled={unread === 0} className="min-h-9 text-xs font-medium text-brand hover:underline disabled:text-muted disabled:no-underline">Mark all read</button>
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {notices.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted">You are all caught up.</li>
            ) : (
              notices.slice(0, 8).map((n) => {
                const Icon = ICON[n.severity];
                const isUnread = cursor ? n.at > cursor : false;
                const inner = (
                  <div className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-sunken", isUnread && "bg-brand-subtle")}>
                    <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center", TONE[n.severity])}><Icon className="size-4" aria-hidden /></span>
                    <div className="min-w-0 text-sm">
                      <p className="flex items-center gap-1.5 font-medium">{n.title}{isUnread && <span className="size-2 rounded-full bg-accent" aria-label="unread" />}</p>
                      <p className="line-clamp-2 text-muted">{n.body}</p>
                      <p className="mt-0.5 text-xs text-muted">{timeAgo(n.at)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <button type="button" className="block w-full text-left" onClick={() => { setOpen(false); markAllRead(); router.push(n.href!); }}>{inner}</button>
                    ) : inner}
                  </li>
                );
              })
            )}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-sm font-medium text-brand hover:bg-sunken">See all notifications</Link>
        </div>
      )}
    </div>
  );
}
