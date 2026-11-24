// All notifications for the signed-in user (derived on the server from data they may already see).
import { AlertOctagon, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { listNotifications } from "@/lib/services/notificationService";

export const dynamic = "force-dynamic";

const ICON = { info: Info, success: CheckCircle2, warn: TriangleAlert, critical: AlertOctagon } as const;
const TONE = { info: "bg-info-50 text-info-600", success: "bg-ok-50 text-ok-600", warn: "bg-warn-50 text-warn-600", critical: "bg-danger-50 text-danger-600" } as const;

export default async function NotificationsPage() {
  const user = await requireRole("student", "staff", "admin");
  const notices = await listNotifications(user);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Notifications" description="What changed on your issues, newest first. These are worked out from your own data, so they only ever show what you are allowed to see." />
      {notices.length === 0 ? (
        <EmptyState art="check" title="You are all caught up" description="New activity on your issues will show up here and in the bell at the top." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {notices.map((n) => {
            const Icon = ICON[n.severity];
            const row = (
              <div className="flex gap-3 px-5 py-4 transition-colors hover:bg-sunken">
                <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", TONE[n.severity])}><Icon className="size-4" aria-hidden /></span>
                <div className="min-w-0">
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-ink-soft">{n.body}</p>
                  <p className="mt-0.5 text-xs text-muted">{timeAgo(n.at)}</p>
                </div>
              </div>
            );
            return n.href ? <Link key={n.id} href={n.href} className="block">{row}</Link> : <div key={n.id}>{row}</div>;
          })}
        </Card>
      )}
    </div>
  );
}
