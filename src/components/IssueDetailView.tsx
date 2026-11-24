// Purpose: full issue page body shared by student / staff / admin routes (server component).
// Shows: status timeline, priority + plain-language "why", affected count, staff notes, report texts.
import { Building2, Info, Lock, Users } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, InfoTip, PriorityBadge, StatusBadge, Timeline, type TimelineItem } from "@/components/ui";
import { DEPARTMENT_NAMES, plural, timeAgo } from "@/lib/format";
import type { IssueDetail } from "@/lib/services/issueService";
import { FlagReport } from "./FlagReport";
import { StatusActions } from "./StatusActions";
import { StatusSteps } from "./StatusSteps";
import { VotePanel } from "./VotePanel";

const TONE: Record<string, TimelineItem["tone"]> = { open: "brand", in_progress: "info", resolved: "ok", reopened: "warn", closed: "neutral" };

export function IssueDetailView({ issue, viewer }: { issue: IssueDetail; viewer: "student" | "staff" | "admin" }) {
  const items: TimelineItem[] = issue.timeline.map((t) => ({
    id: t.id,
    tone: TONE[t.to ?? "open"],
    title: t.from && t.to && t.from !== t.to ? `${t.label}: ${t.from.replace("_", " ")} → ${t.to.replace("_", " ")}` : t.label,
    meta: timeAgo(t.at),
    note: t.note,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {issue.confidential ? <Badge icon={<Lock className="size-3.5" aria-hidden />}>Confidential</Badge> : <PriorityBadge priority={issue.priority} />}
              <StatusBadge status={issue.status} />
              {issue.myRole && <Badge tone="brand">{issue.myRole === "reporter" ? "You reported this" : "You joined this"}</Badge>}
              {issue.needsDepartment && <Badge tone="warn">Needs a department</Badge>}
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{issue.title}</h1>
            {issue.location && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                <span className="inline-flex items-center gap-1.5"><Building2 className="size-4" aria-hidden /> {issue.location.name}</span>
                {issue.department && <span>{DEPARTMENT_NAMES[issue.department] ?? issue.department}</span>}
              </p>
            )}
            {issue.reason && <p className="text-ink-soft">{issue.reason}</p>}
            {issue.confidential && viewer === "student" && <p className="text-ink-soft">This report is handled confidentially by the admin. Nobody else can see it or who wrote it.</p>}
            <StatusSteps status={issue.status} />
            {issue.allowedMoves.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-sm font-semibold text-muted">Update this issue</p>
                <StatusActions issueId={issue.id} moves={issue.allowedMoves} />
              </div>
            )}
          </CardBody>
        </Card>

        {issue.voting && <VotePanel issueId={issue.id} voting={issue.voting} status={issue.status} viewer={viewer} />}

        <Card>
          <CardHeader title="Status history" subtitle="Every change, who made it, and the notes left." />
          <CardBody>{items.length ? <Timeline items={items} /> : <p className="text-sm text-muted">No updates yet.</p>}</CardBody>
        </Card>

        {issue.reports.length > 0 && (
          <Card>
            <CardHeader title={viewer === "student" ? "What was reported" : "Reports"} subtitle={viewer === "admin" && issue.confidential ? "Reporter: Anonymous reporter" : "Reporter names are never shown."} />
            <CardBody>
              <ul className="space-y-3">
                {issue.reports.map((r, i) => (
                  <li key={r.id ?? i} className={`rounded-xl bg-sunken px-4 py-3 text-sm ${r.flagged ? "opacity-70" : ""}`}>
                    <p className="whitespace-pre-wrap text-ink-soft">{r.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted">{timeAgo(r.createdAt)}{r.language ? ` · ${r.language.replace("_", " ")}` : ""}</p>
                      {r.flagged && <Badge tone="danger">Flagged as {r.flagged}</Badge>}
                      {r.canFlag && r.id && <FlagReport reportId={r.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      <aside className="space-y-6">
        {!issue.confidential && (
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1">Who is affected<InfoTip term="meToo" /></span>} />
            <CardBody className="space-y-2">
              <p className="flex items-center gap-2 font-display text-3xl font-semibold"><Users className="size-6 text-brand-600" aria-hidden /> {issue.meToo}</p>
              <p className="text-sm text-muted">{plural(issue.meToo, "student")} reported or joined this issue (&ldquo;me too&rdquo;).</p>
              {issue.crowd && issue.crowd.cappedAccounts > 0 && <p className="text-xs text-muted">{issue.crowd.cappedAccounts} of them are new accounts and count for less.</p>}
            </CardBody>
          </Card>
        )}

        {issue.whyPriority.length > 0 && (
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-1">Why this priority?<InfoTip term="priority" align="end" /></span>} action={<PriorityBadge priority={issue.priority} />} />
            <CardBody>
              <ul className="space-y-2 text-sm text-ink-soft">
                {issue.whyPriority.map((w, i) => (
                  <li key={i} className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />{w}</li>
                ))}
              </ul>
              {issue.routing && <p className="mt-3 border-t border-line pt-3 text-xs text-muted">Routing: {issue.routing}</p>}
            </CardBody>
          </Card>
        )}

      </aside>
    </div>
  );
}
