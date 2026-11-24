"use client";
// Purpose: reports of mine that still need a place, with the question and answer controls inline.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui";
import type { ReportView } from "@/lib/services/reportService";
import { ClarificationPanel } from "./ClarificationPanel";

export function PendingReports({ reports }: { reports: ReportView[] }) {
  const router = useRouter();
  const [local, setLocal] = useState(reports);
  return (
    <div className="space-y-3">
      {local.map((r) => (
        <Card key={r.id} className="rf-pop-in">
          <CardBody>
            <ClarificationPanel
              report={r}
              onUpdated={(n) => {
                setLocal((x) => x.map((y) => (y.id === n.id ? n : y)).filter((y) => y.status === "needs_clarification"));
                router.refresh();
              }}
            />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
