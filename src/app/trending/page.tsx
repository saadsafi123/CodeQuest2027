// Trending board: the issues that matter most right now, campus-wide. Non-confidential only, no student identities.
// Ranking is plain code (rules/trending.ts): priority + how many different students are affected + recent activity.
import { Building2, Flame, Users } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Badge, Card, CardBody, EmptyState, PageHeader, PriorityBadge, StatusBadge, buttonClass } from "@/components/ui";
import { plural, timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { listTrending } from "@/lib/services/trendingService";

export const dynamic = "force-dynamic";

export default async function TrendingPage() {
  const user = await requireRole("student", "staff", "admin");
  const items = await listTrending(user);
  const linkFor = (id: string, department: string | null): string | null =>
    user.role === "admin" ? `/admin/issue/${id}` : user.role === "staff" && user.department && user.department === department ? `/staff/issue/${id}` : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Trending" description="The issues that matter most on campus right now: how serious they are, how many different students are affected, and how recent the activity is." />
      <LiveRefresh everyMs={30000} />
      {items.length === 0 ? (
        <EmptyState title="Nothing is trending" description="When students report problems, the ones that matter most show up here." />
      ) : (
        <ol className="space-y-3">
          {items.map((t, idx) => {
            const href = linkFor(t.issue.id, t.issue.department);
            return (
              <li key={t.issue.id}>
                <Card>
                  <CardBody className="flex flex-wrap items-center gap-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-sm font-semibold text-ink-soft" aria-label={`Rank ${idx + 1}`}>{idx + 1}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={t.issue.priority} />
                        <StatusBadge status={t.issue.status} />
                        {t.rising && <Badge tone="accent" icon={<Flame className="size-3.5" aria-hidden />}>Rising</Badge>}
                      </div>
                      <h2 className="font-sans text-base font-semibold leading-snug">
                        {href ? <Link href={href} className="hover:text-brand-700">{t.issue.title}</Link> : t.issue.title}
                      </h2>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        {t.issue.location && <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden />{t.issue.location.name}</span>}
                        {t.issue.department && <span>{t.issue.department}</span>}
                        <span>Updated {timeAgo(t.issue.updatedAt)}</span>
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="inline-flex items-center gap-1.5 font-semibold text-ink-soft"><Users className="size-4" aria-hidden />{plural(t.issue.meToo, "student")}</p>
                      <p className="text-xs text-muted">affected</p>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      {user.role === "student" && (
        <p className="text-sm text-muted">
          Have the same problem? Report it as you would any other: matching reports are grouped automatically and you are counted.{" "}
          <Link href="/student/new-report" className={buttonClass({ variant: "secondary", size: "sm" })}>Report an issue</Link>
        </p>
      )}
    </div>
  );
}
