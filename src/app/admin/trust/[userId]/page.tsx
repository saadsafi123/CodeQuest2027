// Admin: the explainable trust ledger of one student (start score, every event with its reason, current weight).
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { TrustBreakdownView } from "@/components/TrustBreakdownView";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/guard";
import { ServiceError } from "@/lib/services/errors";
import { getTrustBreakdown } from "@/lib/services/trustService";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireRole("admin");
  const { userId } = await params;
  const t = await getTrustBreakdown(admin, userId).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") return null;
    throw e;
  });
  if (!t) notFound();
  return (
    <div className="space-y-4">
      <BackLink href="/admin/trust" label="All trust scores" />
      <PageHeader title={`Trust ledger: ${t.name}`} description="Start score, every event with its reason, and how much this student's reports and votes currently count." />
      <TrustBreakdownView t={t} self={false} />
    </div>
  );
}
