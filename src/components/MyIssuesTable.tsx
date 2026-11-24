"use client";
// Purpose: the student's issue list: filter tabs, search, a dense table on laptops and stacked rows on phones.
// Filtering is presentation only; WHICH issues arrive here was decided on the server.
import { Inbox, Lock, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, EmptyState, Input, PriorityBadge, StatusBadge, TBody, TD, TH, THead, TR, Table, Tabs, buttonClass } from "@/components/ui";
import { departmentName } from "@/lib/departments";
import { formatUpdated } from "@/lib/format";
import type { IssueSummary } from "@/lib/services/issueService";

type Filter = "all" | "open" | "progress" | "resolved" | "vote";
const MATCH: Record<Filter, (i: IssueSummary) => boolean> = {
  all: () => true,
  open: (i) => i.status === "open" || i.status === "reopened",
  progress: (i) => i.status === "in_progress",
  resolved: (i) => i.status === "resolved" || i.status === "closed",
  vote: (i) => i.needsMyVote,
};

function Status({ i }: { i: IssueSummary }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={i.confidential ? "confidential" : i.status} />
      {i.needsMyVote && <Badge tone="accent">Your vote needed</Badge>}
    </span>
  );
}

export function MyIssuesTable({ issues }: { issues: IssueSummary[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => Object.fromEntries((Object.keys(MATCH) as Filter[]).map((f) => [f, issues.filter(MATCH[f]).length])) as Record<Filter, number>, [issues]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return issues
      .filter(MATCH[filter])
      .filter((i) => !term || i.title.toLowerCase().includes(term) || (i.location?.name ?? "").toLowerCase().includes(term))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [issues, filter, q]);

  if (issues.length === 0)
    return (
      <EmptyState
        title="You have not reported anything yet"
        description="Spotted a broken projector, a leaking tap or a faulty socket? Describe it in your own words and it will reach the right department."
        icon={<Inbox className="size-5" aria-hidden />}
        action={<Link href="/student/new-report" className={buttonClass()}>Report an issue</Link>}
      />
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-full">
          <Tabs
            label="Filter issues"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            items={[
              { id: "all", label: "All", count: counts.all },
              { id: "open", label: "Open", count: counts.open },
              { id: "progress", label: "In progress", count: counts.progress },
              { id: "resolved", label: "Resolved", count: counts.resolved },
              { id: "vote", label: "Needs my vote", count: counts.vote },
            ]}
          />
        </div>
        <div className="relative w-full sm:w-64">
          <label htmlFor="issue-search" className="sr-only">Search my issues</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="issue-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or place" className="w-full pl-9" />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No issues match" description="Try another filter or clear the search." />
      ) : (
        <>
          {/* laptop: table */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Issue</TH>
                  <TH>Location</TH>
                  <TH>Department</TH>
                  <TH>Status</TH>
                  <TH>Priority</TH>
                  <TH className="text-right">Affected</TH>
                  <TH>Last updated</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((i) => (
                  <TR key={i.id}>
                    <TD className="max-w-[22rem]">
                      <Link href={`/student/issue/${i.id}`} className="font-medium text-brand underline-offset-2 hover:underline">
                        {i.title}
                      </Link>
                      {i.myRole && <span className="block text-xs text-muted">{i.myRole === "reporter" ? "You reported this" : "You joined this"}</span>}
                    </TD>
                    <TD className="text-ink">{i.location?.name ?? <span className="text-muted">{i.confidential ? "Not shown" : "Not set"}</span>}</TD>
                    <TD className="text-ink">{i.department ? departmentName(i.department) : <span className="text-muted">{i.confidential ? "Administrator" : "Not assigned"}</span>}</TD>
                    <TD><Status i={i} /></TD>
                    <TD>{i.confidential ? <Badge icon={<Lock className="size-3" aria-hidden />}>Confidential</Badge> : <PriorityBadge priority={i.priority} />}</TD>
                    <TD className="text-right tabular-nums">{i.confidential ? <span className="text-muted">Private</span> : i.meToo}</TD>
                    <TD className="whitespace-nowrap text-muted"><span suppressHydrationWarning>{formatUpdated(i.updatedAt)}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          {/* phone: stacked rows */}
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface md:hidden">
            {rows.map((i) => (
              <li key={i.id}>
                <Link href={`/student/issue/${i.id}`} className="block space-y-2 px-4 py-3 hover:bg-page">
                  <span className="block font-medium text-brand">{i.title}</span>
                  <span className="block text-sm text-muted">
                    {i.location?.name ?? (i.confidential ? "Handled confidentially" : "Place not set")}
                    {i.department ? ` · ${i.department}` : ""}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Status i={i} />
                    {i.confidential ? <Badge icon={<Lock className="size-3" aria-hidden />}>Confidential</Badge> : <PriorityBadge priority={i.priority} />}
                  </span>
                  <span className="block text-xs text-muted">
                    {i.confidential ? "Private" : `${i.meToo} affected`} · Updated <span suppressHydrationWarning>{formatUpdated(i.updatedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
