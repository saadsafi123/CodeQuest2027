// Student home: my issues. Title row with trust chip and primary action, what needs me, a compact summary, then the issue table.
import { FilePlus2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LiveTrustValue } from "@/components/LiveTrust";
import { MyIssuesTable } from "@/components/MyIssuesTable";
import { PendingReports } from "@/components/PendingReports";
import { Alert, InfoTip, PageHeader, SummaryStrip, buttonClass } from "@/components/ui";
import { requireRole } from "@/lib/guard";
import { listMyIssues, listMyPendingReports } from "@/lib/services/issueService";

export const dynamic = "force-dynamic";
export const metadata = { title: "My issues" };

export default async function StudentPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const [issues, pending] = await Promise.all([listMyIssues(user), listMyPendingReports(user)]);
  const inProgress = issues.filter((i) => i.status === "in_progress").length;
  const resolved = issues.filter((i) => i.status === "resolved" || i.status === "closed").length;
  const needVote = issues.filter((i) => i.needsMyVote);
  const reopened = issues.filter((i) => i.status === "reopened");

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Home", href: "/student" }, { label: "My issues" }]}
        title="My issues"
        description="Problems you reported or joined, with their current status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/student/trust" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-surface px-3 text-sm text-ink hover:bg-sunken sm:min-h-10">
              <ShieldCheck className="size-4 text-brand" aria-hidden />
              Trust score <strong className="font-semibold tabular-nums"><LiveTrustValue initial={user.trustScore} /></strong>
            </Link>
            <Link href="/student/new-report" className={buttonClass()}>
              <FilePlus2 className="size-4" aria-hidden /> Report an issue
            </Link>
          </div>
        }
      />

      {sp.denied && <Alert tone="info" title="That page is for another role" />}
      <LiveRefresh active={needVote.length > 0 || reopened.length > 0 || issues.some((i) => i.status === "resolved")} everyMs={10000} />

      {pending.length > 0 && (
        <section aria-labelledby="pending" className="space-y-3">
          <Alert tone="warn" title="Waiting for your answer">
            Tell us where the problem is so it can reach the right department.
          </Alert>
          <h2 id="pending" className="sr-only">Reports waiting for your answer</h2>
          <PendingReports reports={pending} />
        </section>
      )}

      {(needVote.length > 0 || reopened.length > 0) && (
        <section aria-label="Needs you" className="space-y-3">
          {needVote.length > 0 && (
            <Alert tone="info" title={`${needVote.length === 1 ? "A fix is" : `${needVote.length} fixes are`} waiting for your vote`}>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {needVote.map((i) => (
                  <Link key={i.id} href={`/student/issue/${i.id}`} className="font-medium underline">{i.title}</Link>
                ))}
              </span>
            </Alert>
          )}
          {reopened.length > 0 && (
            <Alert tone="warn" title={`${reopened.length === 1 ? "An issue you are affected by was" : `${reopened.length} issues you are affected by were`} reopened`}>
              Enough students disputed the fix, so it went back to the department.{" "}
              {reopened.map((i) => (
                <Link key={i.id} href={`/student/issue/${i.id}`} className="mr-3 font-medium underline">{i.title}</Link>
              ))}
            </Alert>
          )}
        </section>
      )}

      <SummaryStrip
        items={[
          { label: "Total issues", value: issues.length },
          { label: "In progress", value: inProgress },
          { label: "Resolved", value: resolved, info: <InfoTip term="votingWindow" align="start" /> },
          { label: "Awaiting my vote", value: needVote.length },
        ]}
      />

      <section aria-label="My issues list">
        <MyIssuesTable issues={issues} />
      </section>
    </div>
  );
}
