"use client";
// Purpose: filterable, sortable issue list for staff and admin with quick status actions.
// Filtering/sorting is presentation only; WHICH issues arrive here is decided on the server.
import { Inbox, LayoutGrid, List, Lock, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, EmptyState, Input, PriorityBadge, Select, StatusBadge, Table, TBody, TD, TH, THead, Tabs, TR } from "@/components/ui";
import type { IssueSummary } from "@/lib/services/issueService";
import { StatusActions } from "./StatusActions";

const ORDER = { critical: 3, high: 2, medium: 1, low: 0 } as const;

export function IssueQueue({ issues, basePath, showDepartment = false, emptyHint, defaultView = "list" }: { issues: IssueSummary[]; basePath: string; showDepartment?: boolean; emptyHint?: string; defaultView?: "list" | "board" }) {
  const [view, setView] = useState<"list" | "board">(defaultView);
  const [tab, setTab] = useState("active");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("importance");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      active: issues.filter((i) => i.status === "open" || i.status === "reopened" || i.status === "in_progress").length,
      open: issues.filter((i) => i.status === "open" || i.status === "reopened").length,
      in_progress: issues.filter((i) => i.status === "in_progress").length,
      resolved: issues.filter((i) => i.status === "resolved" || i.status === "closed").length,
      all: issues.length,
    }),
    [issues],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = issues.filter((i) => {
      if (tab === "active" && !["open", "reopened", "in_progress"].includes(i.status)) return false;
      if (tab === "open" && !["open", "reopened"].includes(i.status)) return false;
      if (tab === "in_progress" && i.status !== "in_progress") return false;
      if (tab === "resolved" && !["resolved", "closed"].includes(i.status)) return false;
      if (priority !== "all" && i.priority !== priority) return false;
      if (term && !`${i.title} ${i.location?.name ?? ""} ${i.department ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "newest") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "oldest") return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === "metoo") return b.meToo - a.meToo;
      return ORDER[b.priority] - ORDER[a.priority] || b.meToo - a.meToo || +new Date(a.createdAt) - +new Date(b.createdAt);
    });
  }, [issues, tab, priority, sort, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          label="Filter by status"
          value={tab}
          onChange={setTab}
          items={[
            { id: "active", label: "Active", count: counts.active },
            { id: "open", label: "Open", count: counts.open },
            { id: "in_progress", label: "In progress", count: counts.in_progress },
            { id: "resolved", label: "Resolved", count: counts.resolved },
            { id: "all", label: "All", count: counts.all },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor="q" className="sr-only">Search issues</label>
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-44 pl-9" />
          </div>
          <label htmlFor="prio" className="sr-only">Priority</label>
          <Select id="prio" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-36">
            <option value="all">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <div role="group" aria-label="View" className="flex gap-1 rounded-[var(--radius-ctl)] bg-sunken p-1">
            {([["list", "List", List], ["board", "Board", LayoutGrid]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${view === id ? "bg-surface text-brand-700 shadow-sm" : "text-muted hover:text-ink"}`}>
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <label htmlFor="sort" className="sr-only">Sort</label>
          <Select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="w-44">
            <option value="importance">Most important</option>
            <option value="metoo">Most affected</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={issues.length === 0 ? "Nothing here yet" : "No issues match these filters"} description={issues.length === 0 ? (emptyHint ?? "New issues will appear here as students report them.") : "Try another status tab or clear the search."} icon={<Inbox className="size-6" aria-hidden />} />
      ) : view === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Issues by priority">
          {(["critical", "high", "medium", "low"] as const).map((p) => {
            const col = rows.filter((i) => i.priority === p && !i.confidential);
            const tone = { critical: "border-t-danger-600", high: "border-t-warn-600", medium: "border-t-info-600", low: "border-t-line-strong" }[p];
            return (
              <section key={p} aria-label={`${p} priority`} className={`min-w-0 rounded-2xl border border-line border-t-4 bg-sunken/50 p-3 ${tone}`}>
                <div className="mb-3 flex items-center justify-between"><PriorityBadge priority={p} /><span className="text-xs font-semibold text-muted">{col.length}</span></div>
                <ul className="space-y-3">
                  {col.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted">Nothing here</li>}
                  {col.map((i) => (
                    <li key={i.id} className="rf-lift rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-soft)]">
                      <Link href={`${basePath}/${i.id}`} className="font-semibold leading-snug text-ink hover:text-brand-700 hover:underline">{i.title}</Link>
                      <p className="mt-0.5 truncate text-xs text-muted">{i.location?.name ?? "No place"}{showDepartment && i.department ? ` · ${i.department}` : ""}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5"><StatusBadge status={i.status} /><span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft"><Users className="size-3.5 text-muted" aria-hidden />{i.meToo}</span></div>
                      <div className="mt-2"><StatusActions issueId={i.id} moves={i.allowedMoves} compact /></div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Issue</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH className="text-center">Affected</TH>
              {showDepartment && <TH>Department</TH>}
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((i) => (
              <TR key={i.id}>
                <TD className="max-w-xs">
                  <Link href={`${basePath}/${i.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{i.title}</Link>
                  <p className="truncate text-xs text-muted">{i.location?.name ?? "No place"}{i.reason ? ` · ${i.reason}` : ""}</p>
                </TD>
                <TD>{i.confidential ? <Badge icon={<Lock className="size-3.5" aria-hidden />}>Confidential</Badge> : <PriorityBadge priority={i.priority} />}</TD>
                <TD><StatusBadge status={i.status} /></TD>
                <TD className="text-center"><span className="inline-flex items-center gap-1 font-semibold tabular-nums"><Users className="size-3.5 text-muted" aria-hidden />{i.meToo}</span></TD>
                {showDepartment && <TD>{i.department ?? <Badge tone="warn">Needs department</Badge>}</TD>}
                <TD className="text-right"><div className="flex justify-end"><StatusActions issueId={i.id} moves={i.allowedMoves} compact /></div></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
