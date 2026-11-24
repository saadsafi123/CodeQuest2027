"use client";
// Purpose: show the clarification question inline and let the student answer by tapping an option or typing.
import { HelpCircle, Send } from "lucide-react";
import { useState } from "react";
import { Button, Input, useToast } from "@/components/ui";
import type { ReportView } from "@/lib/services/reportService";

export function ClarificationPanel({ report, onUpdated }: { report: ReportView; onUpdated: (r: ReportView) => void }) {
  const toast = useToast();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const c = report.clarification;
  if (!c) return null;

  async function send(body: { answer?: string; locationId?: string }, key: string) {
    setBusy(key);
    const res = await fetch("/api/clarify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId: report.id, ...body }) }).catch(() => null);
    setBusy(null);
    const json = await res?.json().catch(() => null);
    if (!res || !res.ok) return toast({ tone: "error", title: "Could not send your answer", body: json?.error ?? "Please try again." });
    setAnswer("");
    const next: ReportView = json.report;
    if (next.status !== "needs_clarification") toast({ tone: "success", title: "Thanks, place confirmed", body: next.message });
    else if (next.clarification?.adminOnly) toast({ tone: "info", title: "Passed to the admin", body: next.message });
    onUpdated(next);
  }

  if (c.adminOnly) {
    return (
      <div className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-sunken p-4 text-sm">
        <HelpCircle className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <p>{report.message}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3">
        <HelpCircle className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">One quick question</p>
          <p className="mt-0.5 text-sm text-ink" data-testid="clarification-question">{c.question}</p>
          {c.suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested places">
              {c.suggestions.map((s) => (
                <Button key={s.id} type="button" size="sm" variant="secondary" loading={busy === s.id} disabled={busy !== null} onClick={() => send({ locationId: s.id }, s.id)}>
                  {s.name}
                </Button>
              ))}
            </div>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (answer.trim()) send({ answer: answer.trim() }, "text");
            }}
          >
            <label htmlFor={`ans-${report.id}`} className="sr-only">Type the place</label>
            <Input id={`ans-${report.id}`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="…or type the place, e.g. IS Lab 2" maxLength={200} className="min-w-0 flex-1" />
            <Button type="submit" loading={busy === "text"} disabled={busy !== null || !answer.trim()}>
              <Send className="size-4" aria-hidden /> Send
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            {c.answersRemaining} {c.answersRemaining === 1 ? "answer" : "answers"} left. After that the admin will place it for you.
          </p>
        </div>
      </div>
    </div>
  );
}
