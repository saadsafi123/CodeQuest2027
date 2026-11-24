"use client";
// Purpose: the frame around every page. Public pages get the public header and footer; signed-in pages get the workspace:
// utility bar, header (university name, notifications, account menu), a collapsible sidebar (a drawer on phones) and the
// footer. The role is shown ONCE, in the account menu. The judge tools are an edge-docked tab. Presentation only: which
// pages a role may open is decided on the server (requireRole), never here.
import { BookOpen, Bell, ChevronsLeft, ChevronsRight, ClipboardList, FilePlus2, LayoutDashboard, ListChecks, Lock, Menu, ShieldCheck, TrendingUp, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
import { Brand } from "./Brand";
import { JudgeDock } from "./JudgeDock";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";
import { PublicFrame } from "./PublicFrame";
import { SlimFooter } from "./SiteChrome";

export interface FrameUser {
  id: string;
  name: string;
  role: "student" | "staff" | "admin";
  department: string | null;
  trustScore: number;
}

const PUBLIC_PATHS = ["/", "/signin", "/signup", "/help", "/design", "/how-decisions-are-made", "/privacy"];

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

function navFor(user: FrameUser): NavGroup[] {
  const i = "size-[18px] shrink-0";
  const notif = { href: "/notifications", label: "Notifications", icon: <Bell className={i} aria-hidden /> };
  const help = { href: "/help", label: "Help", icon: <BookOpen className={i} aria-hidden /> };
  const trending = { href: "/trending", label: "Trending", icon: <TrendingUp className={i} aria-hidden /> };
  if (user.role === "student")
    return [
      { title: "Issues", items: [{ href: "/student", label: "My issues", icon: <ListChecks className={i} aria-hidden /> }, { href: "/student/new-report", label: "Report an issue", icon: <FilePlus2 className={i} aria-hidden /> }, trending] },
      { title: "Account", items: [{ href: "/student/trust", label: "My trust", icon: <ShieldCheck className={i} aria-hidden /> }, notif] },
      { title: "Support", items: [help] },
    ];
  if (user.role === "staff")
    return [
      { title: "Work", items: [{ href: "/staff", label: "Issue queue", icon: <ClipboardList className={i} aria-hidden /> }, trending, notif] },
      { title: "Support", items: [help] },
    ];
  return [
    { title: "Oversight", items: [{ href: "/admin", label: "Overview", icon: <LayoutDashboard className={i} aria-hidden /> }, { href: "/admin/confidential", label: "Confidential", icon: <Lock className={i} aria-hidden /> }, trending] },
    { title: "People", items: [{ href: "/admin/trust", label: "Trust scores", icon: <Users className={i} aria-hidden /> }, notif] },
    { title: "Support", items: [help] },
  ];
}

function isActive(path: string, href: string): boolean {
  if (href === "/student" || href === "/staff" || href === "/admin") return path === href || path.startsWith(`${href}/issue`);
  return path === href || path.startsWith(`${href}/`);
}

export function AppFrame({ user, status, children }: { user: FrameUser | null; status: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const isPublic = PUBLIC_PATHS.includes(path) || !user;
  return (
    <>
      {isPublic ? <PublicFrame user={user}>{children}</PublicFrame> : <Workspace user={user!} path={path}>{children}</Workspace>}
      <JudgeDock status={status} />
    </>
  );
}

function Workspace({ user, path, children }: { user: FrameUser; path: string; children: React.ReactNode }) {
  const groups = navFor(user);
  const home = groups[0].items[0].href;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCollapsed(localStorage.getItem("rf:nav") === "collapsed"), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDrawer(false), 0); // close the drawer after navigating
    return () => clearTimeout(t);
  }, [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("rf:nav", c ? "expanded" : "collapsed");
      return !c;
    });
  }

  const navList = (showLabels: boolean) => (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
      {groups.map((g) => (
        <div key={g.title} className="mb-3">
          {showLabels ? <p className="px-3 pb-1 text-xs font-medium text-muted">{g.title}</p> : <div className="mx-3 mb-2 border-t border-line" aria-hidden />}
          <ul className="space-y-0.5">
            {g.items.map((n) => {
              const active = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    title={showLabels ? undefined : n.label}
                    className={cn(
                      "relative flex min-h-11 items-center gap-3 rounded-[var(--radius-ctl)] px-3 text-sm transition-colors lg:min-h-9",
                      active ? "bg-brand-subtle font-semibold text-brand" : "text-ink hover:bg-sunken",
                      !showLabels && "justify-center",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand" aria-hidden />}
                    {n.icon}
                    {showLabels ? <span className="truncate">{n.label}</span> : <span className="sr-only">{n.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[var(--radius-ctl)] focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            aria-expanded={drawer}
            className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-ctl)] text-ink hover:bg-sunken lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Brand href={home} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationBell userId={user.id} role={user.role} />
            <ProfileMenu user={user} />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* sidebar (laptop) */}
        <aside className={cn("sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col self-start border-r border-line bg-surface transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-60")}>
          {navList(!collapsed)}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="m-2 flex min-h-9 items-center gap-3 rounded-[var(--radius-ctl)] px-3 text-sm text-muted hover:bg-sunken hover:text-ink"
          >
            {collapsed ? <ChevronsRight className="size-[18px]" aria-hidden /> : <><ChevronsLeft className="size-[18px]" aria-hidden /> Collapse</>}
          </button>
        </aside>

        {/* drawer (phone and tablet) */}
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Close navigation" onClick={() => setDrawer(false)} className="rf-fade-in absolute inset-0 bg-scrim" />
            <aside className="rf-fade-in relative flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-[var(--shadow-pop)]" aria-label="Navigation">
              <div className="flex min-h-14 items-center justify-between border-b border-line px-4">
                <span className="text-sm font-semibold">Menu</span>
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="grid size-11 place-items-center rounded-[var(--radius-ctl)] hover:bg-sunken">
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              {navList(true)}
            </aside>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <SlimFooter />
    </div>
  );
}
