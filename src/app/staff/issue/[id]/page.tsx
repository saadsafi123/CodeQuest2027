// Issue detail for department staff (own department only; anything else is "not found").
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { IssueDetailView } from "@/components/IssueDetailView";
import { requireRole } from "@/lib/guard";
import { ServiceError } from "@/lib/services/errors";
import { getIssueDetail } from "@/lib/services/issueService";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("staff");
  const { id } = await params;
  const issue = await getIssueDetail(user, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") return null;
    throw e;
  });
  if (!issue) notFound();
  return (
    <div className="space-y-4">
      <BackLink href="/staff" label="Department queue" />
      <IssueDetailView issue={issue} viewer="staff" />
    </div>
  );
}
