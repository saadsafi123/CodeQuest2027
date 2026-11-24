// Issue detail for a student who reported or joined it (anything else is "not found").
import { notFound } from "next/navigation";
import { IssueDetailView } from "@/components/IssueDetailView";
import { requireRole } from "@/lib/guard";
import { ServiceError } from "@/lib/services/errors";
import { getIssueDetail } from "@/lib/services/issueService";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("student");
  const { id } = await params;
  const issue = await getIssueDetail(user, id).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") return null;
    throw e;
  });
  if (!issue) notFound();
  return (
    <div className="space-y-4">
      <BackLink href="/student" label="My issues" />
      <IssueDetailView issue={issue} viewer="student" />
    </div>
  );
}
