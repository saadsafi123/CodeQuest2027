// Department queue: ONLY the signed-in staff member's own department (enforced in the service, not here).
import { Flame, Hourglass, ListChecks, Timer } from "lucide-react";
import { IssueQueue } from "@/components/IssueQueue";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Alert, InfoTip, PageHeader, Sparkline, StatTile } from "@/components/ui";
import { DEPARTMENT_NAMES } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { listQueue } from "@/lib/services/issueService";
import { createdSeries, oldestWaitingHours } from "@/lib/viewModels";

export const dynamic = "force-dynamic";

const age = (h: number | null) => (h === null ? "None" : h < 1 ? "< 1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireRole("staff");
  const sp = await searchParams;
  const issues = await listQueue(user);
  const critical = issues.filter((i) => i.priority === "critical" && i.status !== "resolved" && i.status !== "closed");
  const waiting = issues.filter((i) => i.status === "open" || i.status === "reopened").length;
  const voting = issues.filter((i) => i.status === "resolved").length;
  const dept = user.department ?? "";
  return (
    <div className="space-y-6">
      <PageHeader title={`${dept} queue`} description={`${DEPARTMENT_NAMES[dept] ?? dept}. You only see issues for places your department owns.`} />
      <LiveRefresh everyMs={15000} />
      {sp.denied && <Alert tone="info" title="That page is for another role" />}
      {critical.length > 0 && (
        <div role="alert" className="rf-pulse-danger flex items-start gap-3 rounded-[var(--radius-card)] border border-[#f3c2bd] bg-danger-50 p-4 text-danger-600">
          <Flame className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">{critical.length} critical {critical.length === 1 ? "issue needs" : "issues need"} attention now</p>
            <p className="text-ink-soft">{critical.slice(0, 3).map((i) => `${i.title} (${i.location?.name ?? "no place"})`).join(" · ")}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Critical" value={critical.length} tone="danger" icon={<Flame className="size-4" aria-hidden />} info={<InfoTip term="hazard" />} />
        <StatTile label="Waiting" value={waiting} tone="warn" icon={<Hourglass className="size-4" aria-hidden />} hint={`${voting} awaiting student votes`} />
        <StatTile label="Oldest waiting" value={age(oldestWaitingHours(issues))} tone="brand" icon={<Timer className="size-4" aria-hidden />} />
        <StatTile label="All issues" value={issues.length} tone="brand" icon={<ListChecks className="size-4" aria-hidden />} footer={<Sparkline data={createdSeries(issues)} label="Issues created in the last 14 days" />} hint="last 14 days" />
      </div>
      <IssueQueue issues={issues} basePath="/staff/issue" emptyHint={`No issues for ${dept} yet. They appear here as students report problems at places ${dept} owns.`} />
    </div>
  );
}
