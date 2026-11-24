// Purpose: issue summary card for the student dashboard (server component, no client JS).
import { Building2, Lock, Users, Vote } from "lucide-react";
import Link from "next/link";
import { Badge, Card, PriorityBadge, StatusBadge } from "@/components/ui";
import { plural, timeAgo } from "@/lib/format";
import type { IssueSummary } from "@/lib/services/issueService";
import { StatusSteps } from "./StatusSteps";

export function IssueCard({ issue, href }: { issue: IssueSummary; href: string }) {
  return (
    <Card className={`rf-pop-in flex flex-col transition-shadow duration-150 hover:shadow-[var(--shadow-pop)] ${issue.needsMyVote ? "ring-2 ring-accent-500/60" : issue.status === "reopened" ? "ring-2 ring-warn-600/40" : ""}`}>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {issue.confidential ? <Badge icon={<Lock className="size-3.5" aria-hidden />}>Confidential</Badge> : <PriorityBadge priority={issue.priority} />}
          <StatusBadge status={issue.status} />
          {issue.myRole && <Badge tone="brand">{issue.myRole === "reporter" ? "You reported" : "You joined"}</Badge>}
          {issue.needsMyVote && <Badge tone="accent" icon={<Vote className="size-3.5" aria-hidden />}>Your vote needed</Badge>}
        </div>
        <div>
          <h3 className="font-sans text-base font-semibold leading-snug">
            <Link href={href} className="after:absolute after:inset-0 hover:text-brand-700">
              {issue.title}
            </Link>
          </h3>
          {issue.location && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <Building2 className="size-3.5" aria-hidden /> {issue.location.name}
              {issue.department ? ` · ${issue.department}` : ""}
            </p>
          )}
          {issue.confidential && <p className="mt-0.5 text-sm text-muted">Handled confidentially by the admin.</p>}
        </div>
        <StatusSteps status={issue.status} />
        <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-soft">
            <Users className="size-3.5" aria-hidden />
            {issue.confidential ? "Private" : `${plural(issue.meToo, "student")} affected`}
          </span>
          <span>Updated {timeAgo(issue.updatedAt)}</span>
        </div>
      </div>
    </Card>
  );
}
