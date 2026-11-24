// /design: the design-system gallery. Static: no user, no data. Used to review every primitive at laptop and phone width.
import { AlertOctagon, Flame, Inbox, ListChecks, PlayCircle, Search } from "lucide-react";
import {
  Alert, Art, Avatar, Badge, BarList, Button, Card, CardBody, CardHeader, EmptyState, Field, InfoTip, Input, PageHeader, PriorityBadge,
  ProgressRing, Select, Skeleton, SkeletonCard, SkeletonText, Sparkline, StatTile, StatusBadge, Stepper, Textarea, Timeline,
} from "@/components/ui";
import { HELP, type HelpTerm } from "@/lib/helpCopy";

export const metadata = { title: "Design system · ReportFix" };

const SWATCHES = [
  ["paper", "bg-paper"], ["surface", "bg-surface border border-line"], ["sunken", "bg-sunken"], ["brand-100", "bg-brand-100"], ["brand-300", "bg-brand-300"], ["brand-500", "bg-brand-500"],
  ["brand-600", "bg-brand-600"], ["brand-900", "bg-brand-900"], ["accent-500", "bg-accent-500"], ["danger-600", "bg-danger-600"], ["warn-600", "bg-warn-600"], ["ok-600", "bg-ok-600"], ["info-600", "bg-info-600"],
] as const;

export default function DesignPage() {
  return (
    <div className="space-y-12">
      <PageHeader title="Design system" description="Campus Calm, product grade: warm paper, deep teal, terracotta accent, serif headings, soft cards, plain-words help." />

      <Section title="Colour">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {SWATCHES.map(([n, c]) => (
            <div key={n}>
              <div className={`h-14 rounded-xl ${c}`} />
              <p className="mt-1 text-xs text-muted">{n}</p>
            </div>
          ))}
        </div>
        <div className="rf-hero-bg mt-4 rounded-[var(--radius-hero)] p-6 text-white">
          <p className="font-display text-3xl font-semibold text-white">Hero gradient</p>
          <p className="text-brand-100">Used on the landing page and role headers.</p>
        </div>
      </Section>

      <Section title="Type">
        <div className="space-y-2">
          <p className="font-display text-display font-semibold">Display 56</p>
          <p className="font-display text-hero font-semibold">Hero 44</p>
          <h1 className="text-3xl font-semibold">Heading 1</h1>
          <h2 className="text-2xl font-semibold">Heading 2</h2>
          <h3 className="text-lg font-semibold">Heading 3</h3>
          <p>Body text is Plus Jakarta Sans at 15 px. Roman Urdu and English read the same: <em>projector kharab hai</em>.</p>
          <p className="text-sm text-muted">Muted small text for hints and metadata.</p>
        </div>
      </Section>

      <Section title="Buttons and badges">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="soft">Soft</Button><Button variant="ghost">Ghost</Button>
          <Button variant="accent">Accent</Button><Button variant="danger">Danger</Button><Button loading>Loading</Button><Button disabled>Disabled</Button>
          <Button size="sm">Small</Button><Button size="lg">Large</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["critical", "high", "medium", "low"] as const).map((p) => <PriorityBadge key={p} priority={p} />)}
          {["open", "in_progress", "resolved", "reopened", "closed"].map((s) => <StatusBadge key={s} status={s} />)}
          <Badge tone="brand">Brand</Badge><Badge tone="accent">Accent</Badge>
        </div>
      </Section>

      <Section title="Form controls">
        <Card><CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="d-name" hint="Shown on your dashboard."><Input id="d-name" placeholder="Ayesha Khan" /></Field>
          <Field label="Department" htmlFor="d-dept"><Select id="d-dept"><option>Computer Software Engineering (CSE)</option><option>Electrical Engineering (EE)</option></Select></Field>
          <div className="sm:col-span-2"><Field label="What is the problem?" htmlFor="d-text" error="Please describe the problem first."><Textarea id="d-text" aria-invalid /></Field></div>
        </CardBody></Card>
      </Section>

      <Section title="Help in plain words (InfoTip)">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {(Object.keys(HELP) as HelpTerm[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1 text-sm font-semibold">{HELP[k].title}<InfoTip term={k} /></span>
          ))}
        </div>
      </Section>

      <Section title="Stat tiles, charts, rings">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="All issues" value={42} icon={<ListChecks className="size-4" />} tone="brand" footer={<Sparkline data={[2, 4, 3, 6, 5, 9, 7, 11, 8, 12]} />} />
          <StatTile label="Critical" value={3} tone="danger" icon={<Flame className="size-4" />} hint="not yet resolved" info={<InfoTip term="priority" />} />
          <StatTile label="In progress" value={11} tone="ok" icon={<PlayCircle className="size-4" />} footer={<Sparkline data={[1, 2, 2, 3, 5, 4, 6]} tone="ok" />} />
          <StatTile label="Needs attention" value={0} tone="warn" icon={<AlertOctagon className="size-4" />} hint="all clear" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card><CardHeader title="Issues by department" /><CardBody><BarList items={[{ label: "Computer Software Engineering", value: 12, tone: "brand" }, { label: "Electrical Engineering", value: 7, tone: "info" }, { label: "Library", value: 4, tone: "accent" }, { label: "Cafeteria", value: 2, tone: "warn" }]} /></CardBody></Card>
          <Card><CardHeader title="Trust ring" /><CardBody className="flex flex-wrap items-center gap-5">
            <ProgressRing value={72} size={72} label="Trust score 72"><span className="font-display text-xl font-semibold">72</span></ProgressRing>
            <ProgressRing value={45} size={56} tone="warn" label="45 percent"><Avatar name="Zain Raza" size={34} /></ProgressRing>
            <ProgressRing value={100} size={56} tone="ok" label="Done"><span className="text-xs font-bold text-ok-600">OK</span></ProgressRing>
          </CardBody></Card>
        </div>
      </Section>

      <Section title="Stepper and timeline">
        <Card><CardBody className="space-y-6">
          <Stepper steps={[{ label: "Describe", hint: "In your own words" }, { label: "Where", hint: "We ask only if needed" }, { label: "Done", hint: "Sent to the right team" }]} current={1} />
          <Timeline items={[{ id: "1", title: "System", meta: "2 min ago", note: "Issue created from a report.", tone: "brand" }, { id: "2", title: "CSE staff: open → in progress", meta: "1 min ago", tone: "info" }, { id: "3", title: "CSE staff: in progress → resolved", meta: "just now", note: "Replaced the lamp", tone: "ok" }]} />
        </CardBody></Card>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert tone="info" title="Heads up">A fix is waiting for your vote.</Alert>
          <Alert tone="ok" title="All done">Your report was received.</Alert>
          <Alert tone="warn" title="Needs attention">Two reports could not be routed.</Alert>
          <Alert tone="danger" title="Something went wrong">Please try again in a moment.</Alert>
        </div>
      </Section>

      <Section title="Empty states and illustrations">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState title="You have not reported anything yet" description="Spotted a broken projector or a sparking socket? Tell us in your own words." action={<Button>Report a problem</Button>} />
          <EmptyState art="search" title="No issues match" description="Try a different filter or clear the search." />
          <EmptyState art="check" title="All clear" description="Nothing needs your attention right now." />
          <EmptyState art="map" title="Where is this problem?" description="Pick the department, then the place." icon={<Search className="size-6" />} />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          {(["inbox", "search", "shield", "check", "map", "chat"] as const).map((a) => <div key={a} className="text-center"><Art name={a} /><p className="text-xs text-muted">{a}</p></div>)}
        </div>
      </Section>

      <Section title="Loading states">
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard /><SkeletonCard /><Card><CardBody><Skeleton className="mb-3 h-6 w-1/2" /><SkeletonText lines={4} /></CardBody></Card>
        </div>
        <div className="mt-4"><EmptyState icon={<Inbox className="size-6" />} title="Legacy icon variant still works" /></div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={title} className="space-y-3">
      <h2 id={title} className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
