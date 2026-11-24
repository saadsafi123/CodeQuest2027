// Confidential queue (admin only): harassment / ragging. The reporter is always "Anonymous reporter".
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Alert, EmptyState, PageHeader, PriorityBadge, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusActions } from "@/components/StatusActions";
import { timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { listConfidentialQueue } from "@/lib/services/issueService";

export const dynamic = "force-dynamic";

export default async function ConfidentialPage() {
  const user = await requireRole("admin");
  const items = await listConfidentialQueue(user);
  return (
    <div className="space-y-6">
      <PageHeader title="Confidential reports" description="Harassment and ragging. Never shown on any board, never sent to a department, and the reporter's identity is not available to anyone." />
      <Alert tone="info" title="Handle with care">Only you can see this page. Reporters are shown as &ldquo;Anonymous reporter&rdquo; and cannot be identified from here.</Alert>
      {items.length === 0 ? (
        <EmptyState title="No confidential reports" description="Reports about harassment or ragging appear here, and only here." icon={<ShieldCheck className="size-6" aria-hidden />} />
      ) : (
        <Table>
          <THead><tr><TH>Report</TH><TH>Reporter</TH><TH>Priority</TH><TH>Status</TH><TH>Received</TH><TH className="text-right">Actions</TH></tr></THead>
          <TBody>
            {items.map((i) => (
              <TR key={i.id}>
                <TD><Link href={`/admin/issue/${i.id}`} className="font-semibold hover:text-brand-700 hover:underline">{i.title}</Link>{i.location && <p className="text-xs text-muted">Place mentioned: {i.location.name}</p>}</TD>
                <TD>{i.reporterLabel}</TD>
                <TD><PriorityBadge priority={i.priority} /></TD>
                <TD><StatusBadge status={i.status} /></TD>
                <TD className="text-muted">{timeAgo(i.createdAt)}</TD>
                <TD className="text-right"><div className="flex justify-end"><StatusActions issueId={i.id} moves={i.allowedMoves} compact /></div></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
