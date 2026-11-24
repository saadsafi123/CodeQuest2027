// How decisions are made: the plain-language version of "AI understands the text, fixed rules decide". Public page.
import { Card, CardBody, PageHeader } from "@/components/ui";
import { HELP } from "@/lib/helpCopy";

export const metadata = { title: "How decisions are made" };

export default function HowDecisionsPage() {
  const terms = ["priority", "hazard", "crowd", "trust", "reopen", "confidential"] as const;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader crumbs={[{ label: "Home", href: "/" }, { label: "How decisions are made" }]} title="How decisions are made" description="What the software reads, and what fixed rules decide." />
      <Card>
        <CardBody className="space-y-3">
          <h2>Reading your report</h2>
          <p className="text-ink">An AI model reads the sentence you write, in English, Roman Urdu or a mix, and picks out the place, the kind of problem and whether anyone could be in danger. It only reads text. It never decides what happens next, and instructions written inside a report are treated as plain words.</p>
          <h2>Deciding what happens</h2>
          <p className="text-ink">Fixed rules, written down and tested, decide everything else: whether the place is known, which department receives the issue, how urgent it is, whether it joins an existing issue, who may vote on a fix, and how trust scores change. The same report always gets the same result, and every result can be explained.</p>
        </CardBody>
      </Card>
      {terms.map((t) => {
        const e: { title: string; short: string; more?: readonly string[] } = HELP[t];
        return (
          <Card key={t} id={t}>
            <CardBody>
              <h3>{e.title}</h3>
              <p className="mt-1 text-ink">{e.short}</p>
              {e.more && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                  {e.more.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
