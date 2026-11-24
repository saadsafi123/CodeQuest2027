// Privacy: placeholder wording until the university supplies its own notice. Public page.
import { Card, CardBody, PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader crumbs={[{ label: "Home", href: "/" }, { label: "Privacy" }]} title="Privacy" description="Placeholder notice: replace with the university's official privacy statement." />
      <Card>
        <CardBody className="space-y-3 text-ink">
          <h2>What is stored</h2>
          <p>Your name, the reports you file, the issues you join, your votes on fixes and the events that make up your trust score.</p>
          <h2>Confidential reports</h2>
          <p>Reports about harassment or ragging are visible only to administrators. The reporter is shown as an anonymous reporter, and the report is never shown on any board or to other departments.</p>
          <h2>Contact</h2>
          <p>Questions about this notice: {BRAND.email}</p>
        </CardBody>
      </Card>
    </div>
  );
}
