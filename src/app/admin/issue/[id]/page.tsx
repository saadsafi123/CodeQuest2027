// Issue detail for the admin (confidential issues show "Anonymous reporter").
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { IssueDetailView } from "@/components/IssueDetailView";
import { requireRole } from "@/lib/guard";
import { ServiceError } from "@/lib/services/errors";
import { getIssueDetail } from "@/lib/services/issueService";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin");
  const { id } = await params;
  const issue = await getIssueDetail(user, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") return null;
    throw e;
  });
  if (!issue) notFound();
  return (
    <div className="space-y-4">
      <BackLink href={issue.confidential ? "/admin/confidential" : "/admin"} label={issue.confidential ? "Confidential queue" : "Overview"} />
      <IssueDetailView issue={issue} viewer="admin" />
    </div>
  );
}
