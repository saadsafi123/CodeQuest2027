// Admin: every student with trust score, current vote weight and ledger size. Click through for the full ledger.
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { requireRole } from "@/lib/guard";
import { listStudentTrust } from "@/lib/services/trustService";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireRole("admin");
  const rows = await listStudentTrust(user);
  return (
    <div className="space-y-4">
      <PageHeader title="Trust scores" description="Each score is 50 plus the sum of that student's ledger events. Open a row to see every event and why." />
      {rows.length === 0 ? (
        <EmptyState title="No students yet" description="Create a student on the Judge page." />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR><TH>Student</TH><TH>Trust</TH><TH>Vote weight</TH><TH>Ledger events</TH></TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.userId}>
                  <TD><Link href={`/admin/trust/${r.userId}`} className="font-semibold text-brand-700 hover:underline">{r.name}</Link></TD>
                  <TD>{Math.round(r.score)}</TD>
                  <TD>{r.weight.toFixed(2)} {r.capped && <Badge tone="warn" className="ml-1">capped</Badge>}</TD>
                  <TD>{r.events}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
