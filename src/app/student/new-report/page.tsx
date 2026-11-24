// Guided report form (student only).
import { ReportForm } from "@/components/ReportForm";
import { PageHeader } from "@/components/ui";
import { DEPARTMENT_LIST } from "@/lib/departments";
import { requireRole } from "@/lib/guard";
import { listLocations } from "@/lib/rules/location";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  await requireRole("student");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Report a problem" description="Describe what is wrong and where. We work out the department, the place and how important it is." />
      <ReportForm departments={DEPARTMENT_LIST.map((d) => ({ code: d.code, name: d.name }))} places={listLocations().map((l) => ({ id: l.id, name: l.name, owner: l.owner, type: l.type }))} />
    </div>
  );
}
