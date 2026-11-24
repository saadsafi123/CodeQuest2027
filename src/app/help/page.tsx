// Help: how ReportFix works, in plain words. The explanations come from src/lib/helpCopy.ts (the same text as the tooltips).
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardBody, Stepper, buttonClass } from "@/components/ui";
import { HELP, type HelpTerm } from "@/lib/helpCopy";

export const metadata = { title: "How ReportFix works" };

const GROUPS: { title: string; blurb: string; terms: HelpTerm[] }[] = [
  { title: "Reports and places", blurb: "How a sentence becomes an issue in the right queue.", terms: ["place", "department", "meToo", "affected"] },
  { title: "Priority", blurb: "What makes an issue urgent, and what never does.", terms: ["priority", "hazard", "crowd"] },
  { title: "Trust", blurb: "Why some students count a little more, and how to read the score.", terms: ["trust", "weight"] },
  { title: "Confirming a fix", blurb: "How students decide whether a fix really worked.", terms: ["pool", "votingWindow", "reopen", "earlyClose"] },
  { title: "Privacy", blurb: "What stays hidden.", terms: ["confidential"] },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">How ReportFix works</h1>
        <p className="mt-2 text-lg text-muted">The AI reads the text. Plain, fixed rules make every decision, so the result is the same every time and easy to explain.</p>
      </div>
      <Card><CardBody>
        <Stepper steps={[{ label: "Report", hint: "Your own words" }, { label: "Route", hint: "Place decides department" }, { label: "Fix", hint: "Staff resolve it" }, { label: "Confirm", hint: "Affected students vote" }]} current={3} />
      </CardBody></Card>
      {GROUPS.map((g) => (
        <section key={g.title} aria-labelledby={g.title} className="space-y-3">
          <div>
            <h2 id={g.title} className="text-2xl font-semibold">{g.title}</h2>
            <p className="text-sm text-muted">{g.blurb}</p>
          </div>
          <div className="space-y-3">
            {g.terms.map((t) => {
              const e: { title: string; short: string; more?: readonly string[] } = HELP[t];
              return (
                <Card key={t} id={t}><CardBody>
                  <h3 className="font-sans text-base font-semibold">{e.title}</h3>
                  <p className="mt-1 text-ink-soft">{e.short}</p>
                  {e.more && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">{e.more.map((m) => <li key={m}>{m}</li>)}</ul>}
                </CardBody></Card>
              );
            })}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap gap-3">
        <Link href="/signup" className={buttonClass()}>Try it <ArrowRight className="size-4" aria-hidden /></Link>
        <Link href="/signin" className={buttonClass({ variant: "secondary" })}>Sign in</Link>
      </div>
    </div>
  );
}
