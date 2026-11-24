"use client";
// Purpose: the guided report form. Submit -> understanding -> either a confirmation, an inline clarification
// question, or a confidential acknowledgement.
import { CheckCircle2, HelpCircle, Lock, MapPin, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, CardBody, Field, Input, PriorityBadge, Stepper, Textarea, buttonClass, useToast } from "@/components/ui";
import type { ReportView } from "@/lib/services/reportService";
import { ClarificationPanel } from "./ClarificationPanel";
import { PlacePicker, type PickerDepartment, type PickerPlace } from "./PlacePicker";
import { PlaceQuestion } from "./PlaceQuestion";

const EXAMPLES = [
  "The projector in the networking lab is not working since Monday",
  "ee lab 2 ka AC kharab hai, bohat garmi hai",
  "wifi nahi chal raha IS lab 1 mein",
  "Water cooler near the library is leaking",
];
const MAX = 2000;
const STEPS = [{ label: "Describe", hint: "In your own words" }, { label: "Details", hint: "Only if we need it" }, { label: "Confirm", hint: "Check and send" }, { label: "Sent", hint: "To the right team" }];
const FLOW = ["needs_problem", "needs_place", "needs_confirm"];

export function ReportForm({ departments, places }: { departments: PickerDepartment[]; places: PickerPlace[] }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportView | null>(null);
  // optional picker: only a hint, the server compares it with the place named in the text
  const [dept, setDept] = useState("");
  const [loc, setLoc] = useState("");
  // The conversation: the text, plus the student's answers to the counter-questions, plus the place they gave.
  const [extras, setExtras] = useState<string[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [placeText, setPlaceText] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  type Over = { extras?: string[]; choice?: string | null; placeText?: string | null };
  /** One round trip. preview=true only asks the next question / shows the summary (nothing is saved). preview=false sends it. */
  async function run(preview: boolean, key: string, over: Over = {}) {
    if (!text.trim()) return setError("Please describe the problem first.");
    const ex = over.extras ?? extras;
    const ch = over.choice !== undefined ? over.choice : choice;
    const pt = over.placeText !== undefined ? over.placeText : placeText;
    setError(null);
    setAsking(key);
    const hint = dept || loc ? { department: dept || null, locationId: loc || null } : null;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: [text, ...ex].join(". "), hint, choice: ch, placeText: pt, preview, followUpAnswers: ex.length }),
    }).catch(() => null);
    setAsking(null);
    const json = await res?.json().catch(() => null);
    if (!res || !res.ok) {
      const msg = json?.error ?? "Could not reach the server. Please try again.";
      setError(msg);
      return toast({ tone: "error", title: "Report not sent", body: msg });
    }
    setExtras(ex);
    setChoice(ch);
    setPlaceText(pt);
    setResult(json.report);
    if (FLOW.includes(json.report.status)) return; // a question or the summary: nothing is saved yet
    router.refresh();
    if (json.report.status !== "needs_clarification") toast({ tone: "success", title: "Report received", body: json.report.message });
  }

  function restartFlow() {
    setExtras([]);
    setChoice(null);
    setPlaceText(null);
    setResult(null);
  }

  function reset() {
    restartFlow();
    setText("");
    setError(null);
    setDept("");
    setLoc("");
  }

  const inFlow = !!result && FLOW.includes(result.status);

  if (result && result.status !== "needs_clarification" && !FLOW.includes(result.status)) {
    return (
      <div className="space-y-5">
        <Stepper steps={STEPS} current={4} />
        <Done result={result} onAgain={reset} />
      </div>
    );
  }

  if (result?.clarification) {
    return (
      <div className="space-y-4">
        <Stepper steps={STEPS} current={1} />
        <Card>
          <CardBody>
            <p className="text-sm font-semibold text-muted">Your report</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-soft">{text}</p>
          </CardBody>
        </Card>
        <ClarificationPanel
          report={result}
          onUpdated={(r) => {
            setResult(r);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(true, "check", { extras: [], choice: null, placeText: null }); }} className="space-y-4" noValidate>
      <Stepper steps={STEPS} current={result?.status === "needs_confirm" ? 2 : inFlow ? 1 : 0} />
      <Card>
        <CardBody className="space-y-4">
          <Field label="What is the problem, and where?" htmlFor="report-text" hint="English, Roman Urdu or a mix. Spelling mistakes are fine. Say which lab, room or building." error={error}>
            <Textarea id="report-text" value={text} onChange={(e) => { setText(e.target.value.slice(0, MAX)); if (inFlow || extras.length || choice || placeText) restartFlow(); }} placeholder="e.g. The projector in the DB lab is not working since Monday" aria-invalid={!!error} rows={5} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" aria-hidden /> Tone does not matter: capital letters and the word &ldquo;urgent&rdquo; change nothing.
            </span>
            <span>{text.length}/{MAX}</span>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-line bg-surface px-3 py-1 text-left text-xs text-ink-soft transition-colors hover:border-brand-500 hover:bg-brand-50">
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <details className="rounded-xl border border-line bg-sunken/40 px-4 py-3" open={result?.status === "needs_place" ? false : undefined}>
            <summary className="cursor-pointer text-sm font-semibold text-ink-soft">Choose the department and place from a list (optional)</summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted">Not needed: just write where it is. The department is decided by the AI. If you pick here and your text names a different place, we ask which is right.</p>
              <PlacePicker departments={departments} places={places} department={dept} locationId={loc} onChange={(v) => { setDept(v.department); setLoc(v.locationId); }} />
            </div>
          </details>
          {result?.status === "needs_problem" && result.followUp && (
            <ProblemQuestion
              question={result.followUp.question}
              busy={asking === "problem"}
              onAnswer={(a) => run(true, "problem", { extras: [...extras, a] })}
              onCancel={restartFlow}
            />
          )}
          {result?.status === "needs_place" && result.placePrompt && (
            <PlaceQuestion
              prompt={result.placePrompt}
              departments={departments}
              places={places}
              busy={asking}
              onChoose={(id) => run(true, id, { choice: id, placeText: null })}
              onType={(t) => run(true, "typed", { placeText: t, choice: null })}
              onCancel={restartFlow}
            />
          )}
          {result?.status === "needs_confirm" && result.summary && (
            <ConfirmCard summary={result.summary} busy={asking === "send"} onSend={() => run(false, "send")} onEdit={restartFlow} />
          )}
          {!inFlow && (
            <Button type="submit" size="lg" loading={asking === "check"} className="w-full sm:w-auto">
              {asking !== "check" && <Send className="size-4" aria-hidden />}
              {asking === "check" ? "Understanding your report…" : "Continue"}
            </Button>
          )}
        </CardBody>
      </Card>
      <Alert tone="info" title="Reporting harassment or ragging?">Just write it. These reports are kept confidential: they never appear on any board, are not sent to a department, and your identity is not revealed.</Alert>
    </form>
  );
}

function Done({ result, onAgain }: { result: ReportView; onAgain: () => void }) {
  return (
    <Card className="rf-pop-in">
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${result.confidential ? "bg-sunken text-ink-soft" : "bg-ok-50 text-ok-600"}`}>
            {result.confidential ? <Lock className="size-5" aria-hidden /> : <CheckCircle2 className="size-5" aria-hidden />}
          </span>
          <div>
            <h2 className="text-xl font-semibold">{result.confidential ? "Received, confidentially" : result.issue?.joinedExisting ? "You are now counted" : "Report received"}</h2>
            <p className="mt-1 text-ink-soft" data-testid="report-result">{result.message}</p>
          </div>
        </div>
        {result.issue && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sunken p-3 text-sm">
            <span className="font-semibold">Priority</span> <PriorityBadge priority={result.issue.priority as "low"} />
            <span className="text-muted">·</span>
            <span>{result.issue.meToo} {result.issue.meToo === 1 ? "student" : "students"} affected</span>
            {result.issue.department && (<><span className="text-muted">·</span><span>{result.issue.department} department</span></>)}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {result.issue && <Link href={`/student/issue/${result.issue.id}`} className={buttonClass()}>View the issue</Link>}
          <Link href="/student" className={buttonClass({ variant: "secondary" })}>Go to my issues</Link>
          <Button variant="ghost" onClick={onAgain}>Report another problem</Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** The AI could not tell what the problem is, so it asks. The answer is added to the report and checked again. */
function ProblemQuestion({ question, busy, onAnswer, onCancel }: { question: string; busy: boolean; onAnswer: (answer: string) => void; onCancel: () => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-sunken p-4" role="group" aria-labelledby="problem-q">
      <div className="flex gap-3">
        <HelpCircle className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p id="problem-q" className="font-semibold text-ink" data-testid="follow-up-question">{question}</p>
            <p className="mt-0.5 text-xs text-muted">Nothing has been sent yet.</p>
          </div>
          {/* not a <form>: this sits inside the report form, and forms cannot be nested */}
          <div className="flex flex-wrap gap-2">
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (answer.trim() && !busy) onAnswer(answer.trim());
                }
              }}
              placeholder="e.g. the projector is not working"
              maxLength={300}
              aria-label="Your answer"
              className="min-w-0 flex-1"
            />
            <Button type="button" loading={busy} disabled={!answer.trim()} onClick={() => onAnswer(answer.trim())}>Continue</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Edit my report</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Everything is clear: show what will be sent. Only the student's confirmation saves and routes it. */
function ConfirmCard({ summary, busy, onSend, onEdit }: { summary: NonNullable<ReportView["summary"]>; busy: boolean; onSend: () => void; onEdit: () => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-sunken p-4" role="group" aria-labelledby="confirm-q">
      <div className="space-y-3">
        <p id="confirm-q" className="font-semibold text-ink">{summary.confidential ? "Ready to send, confidentially" : "Please check before sending"}</p>
        {summary.confidential ? (
          <p className="flex items-start gap-2 text-sm text-ink-soft" data-testid="confirm-summary">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> It goes only to the admin. It is not shown on any board or sent to a department, and your identity is not shared.
          </p>
        ) : (
          <dl className="space-y-1.5 text-sm" data-testid="confirm-summary">
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">Problem</dt><dd className="text-ink">{summary.problem}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">Place</dt><dd className="flex items-center gap-1.5 text-ink"><MapPin className="size-4 shrink-0 text-muted" aria-hidden />{summary.place?.name}</dd></div>
          </dl>
        )}
        <p className="text-xs text-muted">The AI decides which department gets it. Nothing is sent until you confirm.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" loading={busy} onClick={onSend}>{!busy && <Send className="size-4" aria-hidden />}Send report</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onEdit}>Change something</Button>
        </div>
      </div>
    </div>
  );
}
