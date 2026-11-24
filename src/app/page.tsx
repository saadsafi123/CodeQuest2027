// Public landing page: explains ReportFix like a real product. No user list here: sign in / sign up are their own pages
// and the judge tools live in the floating dock.
import { ArrowRight, Brain, CheckCheck, FileText, Languages, Lock, MapPin, Scale, ShieldCheck, Users, Vote } from "lucide-react";
import Link from "next/link";
import { Alert, Art, Badge, PriorityBadge, buttonClass, cn } from "@/components/ui";
import { isDbConfigured } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: FileText, title: "Report", text: "Describe a problem in English, Roman Urdu or a mix. Typos are fine." },
  { icon: Brain, title: "Understand and route", text: "AI reads it. Fixed rules pick the place, the owning department and the priority." },
  { icon: Users, title: "Group", text: "The same problem at the same place becomes one issue with a \"me too\" count." },
  { icon: CheckCheck, title: "Fix and confirm", text: "Staff resolve it. The students it affects confirm it is really fixed, or reopen it." },
];

const FAIR = [
  { icon: Scale, title: "Impact, not tone", text: "SHOUTING and the word \"urgent\" change nothing. Danger is always critical, even when described calmly." },
  { icon: Users, title: "One person is never a crowd", text: "Many credible students raise importance. One very trusted student cannot push a minor issue to the top." },
  { icon: ShieldCheck, title: "Trust you can read", text: "Every trust change is a line with a reason. Open the ledger and the score adds up exactly." },
  { icon: Lock, title: "Harassment stays confidential", text: "Admin only, never on a board, never sent to a department, and the reporter is never revealed." },
];

const ROLES = [
  { title: "Students", text: "Report in your own words, follow every step, and confirm or dispute the fix when it affects you.", points: ["Guided report form", "Live status timeline", "Your vote counts"], tone: "bg-brand-50 text-brand-700" },
  { title: "Department staff", text: "A clear queue of only your department's issues, ranked by real impact, with one-click status updates.", points: ["Priority lanes", "Critical alerts", "Resolve with a note"], tone: "bg-info-50 text-info-600" },
  { title: "Admin", text: "See everything at a glance, handle confidential reports, and keep trust scores explainable.", points: ["Campus overview", "Confidential queue", "Trust ledger"], tone: "bg-accent-50 text-accent-600" },
];

const FAQ = [
  ["Do I need a password?", "No. This demo uses one-click sign in: pick a role and an account, or create a new student in seconds."],
  ["What happens if the AI is unavailable?", "A rule-based reader takes over. Every decision rule (priority, routing, trust, voting) is identical, and the status chip tells you which mode is running."],
  ["Who can see a harassment report?", "Only the admin, and the admin sees \"Anonymous reporter\". It never appears on any board or in any department queue."],
  ["Why does it ask me where the problem is?", "The place decides which department gets the issue. If it is missing or unclear we ask before anything is saved, so nothing is sent to the wrong people by a guess."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ need?: string; denied?: string }> }) {
  const sp = await searchParams;
  const setup = !isDbConfigured() ? "The database is not configured yet. Follow docs/SETUP.md, then reload." : null;
  return (
    <div>
      {/* hero */}
      <section className="rf-hero-bg relative overflow-hidden text-white">
        <div className="rf-dots pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rf-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide ring-1 ring-white/20">
              <ShieldCheck className="size-4" aria-hidden /> Campus issue reporting that is fair, fast and explainable
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] text-white sm:text-6xl">Report it once.<br />Get it fixed.<br /><span className="text-brand-200">Confirm it is fixed.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-brand-100">
              ReportFix sends every campus problem to the department that owns the place, ranks it by real impact (never by tone), and lets the students it affects confirm the fix.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={buttonClass({ size: "lg", variant: "onDark" })}>Get started <ArrowRight className="size-4" aria-hidden /></Link>
              <Link href="/signin" className={buttonClass({ size: "lg", variant: "outlineDark" })}>Sign in</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100">
              <li className="flex items-center gap-2"><Languages className="size-4" aria-hidden /> English, Roman Urdu, mixed</li>
              <li className="flex items-center gap-2"><MapPin className="size-4" aria-hidden /> Never routes a guess</li>
              <li className="flex items-center gap-2"><Vote className="size-4" aria-hidden /> Students verify the fix</li>
            </ul>
          </div>

          {/* static product mock (no data) */}
          <div className="rf-rise rf-rise-2 relative mx-auto w-full max-w-md" aria-hidden>
            <div className="rf-float rounded-3xl bg-surface p-5 text-ink shadow-[var(--shadow-pop)]">
              <div className="flex flex-wrap items-center gap-1.5"><PriorityBadge priority="medium" /><Badge tone="info">In progress</Badge><Badge tone="brand">3 students affected</Badge></div>
              <p className="mt-3 font-display text-xl font-semibold">Projector not working</p>
              <p className="text-sm text-muted">Networking Lab · Computer Software Engineering</p>
              <p className="mt-2 rounded-xl bg-sunken px-3 py-2 text-sm text-ink-soft">&ldquo;projector kharab hai networking lab mein&rdquo;</p>
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {["Reported", "In progress", "Resolved", "Confirmed"].map((s, i) => (
                  <div key={s}><div className={cn("h-1.5 rounded-full", i < 2 ? "bg-brand-500" : "bg-line")} /><p className={cn("mt-1 text-[10px]", i < 2 ? "font-semibold text-ink" : "text-muted")}>{s}</p></div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
                <span className="font-semibold">Is it really fixed?</span>
                <span className="flex gap-1.5"><span className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">Yes</span><span className="rounded-lg bg-danger-600 px-2.5 py-1 text-xs font-semibold text-white">No</span></span>
              </div>
            </div>
            <div className="rf-float absolute -left-4 -top-4 hidden rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-[var(--shadow-lift)] sm:block" style={{ animationDelay: "1s" }}>Understood: Roman Urdu</div>
            <div className="rf-float absolute -bottom-4 -right-3 hidden rounded-2xl bg-accent-500 px-3 py-2 text-xs font-semibold text-white shadow-[var(--shadow-lift)] sm:block" style={{ animationDelay: "2s" }}>Sent to CSE, the owner</div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-4 py-14">
        {sp.need === "signin" && <Alert tone="info" title="Please sign in to continue">That page needs you to choose who you are first. No password needed.</Alert>}
        {sp.denied && <Alert tone="info" title="That page is for another role">Sign in with a different account.</Alert>}
        {setup && <Alert tone="warn" title="Setup needed">{setup}</Alert>}

        {/* how it works */}
        <section id="how" aria-labelledby="how-h" className="scroll-mt-24">
          <div className="mb-8 max-w-2xl">
            <h2 id="how-h" className="font-display text-3xl font-semibold sm:text-4xl">From a sentence to a verified fix</h2>
            <p className="mt-2 text-muted">Four steps, each one explained on screen as it happens.</p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rf-lift rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><s.icon className="size-5" aria-hidden /></span>
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted">Step {i + 1}</p>
                <p className="font-display text-xl font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* fair by design */}
        <section id="fair" aria-labelledby="fair-h" className="scroll-mt-24 rounded-[var(--radius-hero)] bg-surface p-6 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 id="fair-h" className="font-display text-3xl font-semibold sm:text-4xl">Built to be fair, and to prove it</h2>
              <p className="mt-2 text-muted">The AI only reads text. Every decision that matters is a fixed rule you can read, test and explain.</p>
              <Art name="shield" className="mt-4 h-32" />
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {FAIR.map((f) => (
                <li key={f.title} className="rounded-2xl bg-paper p-4">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-100 text-brand-700"><f.icon className="size-[18px]" aria-hidden /></span>
                  <p className="mt-3 font-semibold">{f.title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* roles */}
        <section id="roles" aria-labelledby="roles-h" className="scroll-mt-24">
          <div className="mb-8 max-w-2xl">
            <h2 id="roles-h" className="font-display text-3xl font-semibold sm:text-4xl">One product, three workspaces</h2>
            <p className="mt-2 text-muted">Each role lands on its own dashboard and sees only what it should.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {ROLES.map((r) => (
              <article key={r.title} className="rf-lift rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
                <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-bold", r.tone)}>{r.title}</span>
                <p className="mt-3 text-ink-soft">{r.text}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {r.points.map((p) => <li key={p} className="flex items-center gap-2"><CheckCheck className="size-4 text-ok-600" aria-hidden />{p}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* faq */}
        <section aria-labelledby="faq-h" className="mx-auto max-w-3xl">
          <h2 id="faq-h" className="mb-6 text-center font-display text-3xl font-semibold">Questions people ask</h2>
          <div className="space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-4 shadow-[var(--shadow-soft)]">
                <summary className="cursor-pointer list-none font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">{q}<span className="text-brand-600 transition-transform group-open:rotate-45" aria-hidden>+</span></span>
                </summary>
                <p className="mt-2 text-sm text-ink-soft">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* final cta */}
        <section className="rf-hero-bg rounded-[var(--radius-hero)] px-6 py-12 text-center text-white sm:py-16">
          <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">See it work in two minutes</h2>
          <p className="mx-auto mt-2 max-w-xl text-brand-100">Create a student, report a problem, then switch to staff and watch it arrive.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonClass({ size: "lg", variant: "onDark" })}>Create a student</Link>
            <Link href="/signin" className={buttonClass({ size: "lg", variant: "outlineDark" })}>Sign in as staff or admin</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
