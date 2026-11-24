// Purpose: the trust explainer (server component). Starting score, every ledger event with its plain-language reason
// and running total, the current vote/report weight and why. Used by the student's own page and the admin page.
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Scale, ShieldCheck } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, InfoTip, ProgressRing } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import type { TrustBreakdown } from "@/lib/services/trustService";

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export function TrustBreakdownView({ t, self }: { t: TrustBreakdown; self: boolean }) {
  const net = Math.round((t.currentScore - t.startScore) * 100) / 100;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
      <div className="space-y-6">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <p className="flex items-center gap-1 text-sm font-semibold text-muted">{self ? "Your trust score" : `${t.name}'s trust score`}<InfoTip term="trust" /></p>
              <ProgressRing value={t.currentScore} size={112} stroke={9} label={`Trust score ${Math.round(t.currentScore)} out of 100`} className="mt-2">
                <span className="font-display text-4xl font-semibold text-brand-700">{Math.round(t.currentScore)}</span>
              </ProgressRing>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5 text-sm text-ink-soft">
              <p>
                Starts at <strong>{t.startScore}</strong>, then every event below adds or subtracts. {t.events.length === 0 ? "No events yet." : `Net change ${sign(net)} from ${t.events.length} ${t.events.length === 1 ? "event" : "events"}.`}
              </p>
              {t.consistent ? (
                <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Rebuilds exactly: {t.startScore} {t.events.length ? `${sign(net)} ` : ""}= {Math.round(t.rebuiltScore)}</Badge>
              ) : (
                <Badge tone="danger">Ledger and cached score disagree ({t.rebuiltScore} vs {t.currentScore})</Badge>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Every change, with the reason" subtitle="This list is the whole truth: the score is nothing but the start value plus these rows." />
          <CardBody>
            <ol className="divide-y divide-line">
              <li className="flex items-center gap-3 py-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken font-semibold text-ink-soft">{t.startScore}</span>
                <span className="font-semibold">Starting score</span>
              </li>
              {t.events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-3 text-sm">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${e.delta >= 0 ? "bg-ok-50 text-ok-600" : "bg-danger-50 text-danger-600"}`}
                    aria-label={`${e.delta >= 0 ? "Gained" : "Lost"} ${Math.abs(e.delta)}`}
                  >
                    {e.delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                    {sign(e.delta)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-soft">{e.reason}</p>
                    <p className="text-xs text-muted">{timeAgo(e.at)}</p>
                  </div>
                  <span className="shrink-0 text-right text-xs text-muted">total<br /><strong className="text-sm text-ink">{e.runningTotal}</strong></span>
                </li>
              ))}
            </ol>
            {t.events.length === 0 && <p className="py-4 text-sm text-muted">Nothing has changed this score yet.</p>}
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-1">Current vote weight<InfoTip term="weight" align="end" /></span>} action={<Scale className="size-5 text-brand-600" aria-hidden />} />
          <CardBody className="space-y-3">
            <p className="font-display text-4xl font-semibold">{t.weight.value.toFixed(2)}</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              {t.weight.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="What moves the score" action={<ShieldCheck className="size-5 text-brand-600" aria-hidden />} />
          <CardBody>
            <ul className="space-y-2 text-sm text-ink-soft">
              {t.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
