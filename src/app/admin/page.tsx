// Admin overview: KPI tiles with trends, load per department, hot places, then every non-confidential issue and the
// reports that need the admin. Confidential reports live on their own page and are only COUNTED here.
import { Building, Flame, HelpCircle, ListChecks, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { AdminSummary } from "@/components/AdminSummary";
import { AssignPlace } from "@/components/AssignPlace";
import { IssueQueue } from "@/components/IssueQueue";
import { LiveRefresh } from "@/components/LiveRefresh";
import { RetryReport } from "@/components/RetryReport";
import { Alert, BarList, Card, CardBody, CardHeader, InfoTip, PageHeader, Sparkline, StatTile } from "@/components/ui";
import { requireRole } from "@/lib/guard";
import { listLocations } from "@/lib/rules/location";
import { adminOverview } from "@/lib/services/issueService";
import { createdSeries, departmentLoad, hotPlaces, resolvedSeries } from "@/lib/viewModels";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const o = await adminOverview(user);
  const places = listLocations().map((l) => ({ id: l.id, name: l.name })).sort((a, b) => a.name.localeCompare(b.name));
  const created = createdSeries(o.issues);
  const resolved = resolvedSeries(o.issues);
  return (
    <div className="space-y-8">
      <PageHeader title="Admin overview" description="Everything happening on campus, ranked by real impact." />
      <LiveRefresh everyMs={20000} />
      {sp.denied && <Alert tone="info" title="That page is for another role" />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="All issues" value={o.stats.total} tone="brand" icon={<ListChecks className="size-4" aria-hidden />} footer={<Sparkline data={created} label="Issues created, last 14 days" />} />
        <StatTile label="Critical" value={o.stats.critical} tone="danger" hint="not yet resolved" icon={<Flame className="size-4" aria-hidden />} info={<InfoTip term="hazard" />} />
        <StatTile label="In progress" value={o.stats.inProgress} tone="ok" icon={<PlayCircle className="size-4" aria-hidden />} footer={<Sparkline data={resolved} tone="ok" label="Issues resolved, last 14 days" />} />
        <StatTile label="Needs department" value={o.stats.needsDepartment} tone="warn" icon={<Building className="size-4" aria-hidden />} info={<InfoTip term="department" />} />
        <StatTile label="Awaiting place" value={o.stats.awaitingPlace} tone="warn" icon={<HelpCircle className="size-4" aria-hidden />} info={<InfoTip term="place" align="end" />} />
        <Link href="/admin/confidential" className="block transition-transform hover:-translate-y-0.5">
          <StatTile label="Confidential" value={o.stats.confidential} icon={<Lock className="size-4" aria-hidden />} hint="open the queue" info={<InfoTip term="confidential" align="end" />} />
        </Link>
      </div>

      <AdminSummary />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Load by department" subtitle="Active issues right now" />
          <CardBody><BarList items={departmentLoad(o.issues)} emptyText="No active issues." /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Hot places" subtitle="Where problems cluster" />
          <CardBody><BarList items={hotPlaces(o.issues)} emptyText="No active issues." /></CardBody>
        </Card>
      </div>

      {o.needsAttention.length > 0 && (
        <Card className="border-danger-600/40">
          <CardHeader title="Needs attention" subtitle="These reports were saved but never became an issue (a failure while creating it). Nothing is lost: retry each one." />
          <CardBody className="space-y-4">
            {o.needsAttention.map((r) => (
              <div key={r.reportId} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
                <div className="max-w-xl text-sm">
                  <p className="font-semibold text-ink-soft">{r.confidential ? "Confidential report (text and author stay hidden)" : r.text}</p>
                  <p className="text-xs text-muted">{r.location ? `${r.location} · ` : ""}{r.reason}</p>
                </div>
                <RetryReport reportId={r.reportId} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {o.awaitingPlace.length > 0 && (
        <Card>
          <CardHeader title="Reports waiting for a place" subtitle="The student could not name a known place after two tries. Pick the right one to route it." />
          <CardBody className="space-y-4">
            {o.awaitingPlace.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
                <p className="max-w-xl text-sm text-ink-soft">{r.clarification?.question}</p>
                <AssignPlace reportId={r.id} places={places} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="all" className="space-y-3">
        <h2 id="all" className="text-xl font-semibold">All issues</h2>
        <IssueQueue issues={o.issues} basePath="/admin/issue" showDepartment emptyHint="No issues yet. Sign in as a student and report one." />
      </section>
    </div>
  );
}
