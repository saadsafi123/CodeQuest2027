// "Why is my trust score X?": the student's own ledger, weight and rules.
import { BackLink } from "@/components/BackLink";
import { TrustBreakdownView } from "@/components/TrustBreakdownView";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/guard";
import { getTrustBreakdown } from "@/lib/services/trustService";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireRole("student");
  const t = await getTrustBreakdown(user, user.id);
  return (
    <div className="space-y-4">
      <BackLink href="/student" label="My issues" />
      <PageHeader title={`Why is my trust score ${Math.round(t.currentScore)}?`} description="Your score decides how much your reports and votes count. Here is every reason, so nothing is a black box." />
      <TrustBreakdownView t={t} self />
    </div>
  );
}
