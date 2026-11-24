"use client";
// Purpose: status buttons for staff/admin. The server decides which moves are allowed (allowedMoves); this only
// renders them. Resolving requires a note (asked in a dialog).
import { CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import { announceTrustMayHaveChanged } from "./LiveTrust";

type Move = "in_progress" | "resolved" | "closed" | "open" | "reopened";
const LABEL: Record<string, string> = { in_progress: "Start work", resolved: "Mark resolved", closed: "Close now" };

export function StatusActions({ issueId, moves, compact = false }: { issueId: string; moves: string[]; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Move | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usable = moves.filter((m) => LABEL[m] && !(compact && m === "closed")) as Move[]; // closing lives on the detail page
  if (usable.length === 0) return null;

  async function run(to: Move, withNote: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/issues/${issueId}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, note: withNote }) }).catch(() => null);
    setBusy(false);
    const json = await res?.json().catch(() => null);
    if (!res || !res.ok) {
      const msg = json?.error ?? "Could not update the issue.";
      setError(msg);
      toast({ tone: "error", title: "Status not changed", body: msg });
      return;
    }
    toast({ tone: "success", title: LABEL[to] === "Mark resolved" ? "Marked resolved" : LABEL[to] === "Start work" ? "Work started" : "Issue closed" });
    setDialog(null);
    setNote("");
    announceTrustMayHaveChanged();
    router.refresh();
  }

  const icon = (m: Move) => (m === "in_progress" ? <PlayCircle className="size-4" aria-hidden /> : m === "resolved" ? <CheckCircle2 className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {usable.map((m) => (
          <Button
            key={m}
            size={compact ? "sm" : "md"}
            variant={m === "resolved" ? "primary" : m === "closed" ? "ghost" : "secondary"}
            disabled={busy}
            onClick={() => (m === "in_progress" ? run(m, "") : setDialog(m))}
          >
            {icon(m)} {LABEL[m]}
          </Button>
        ))}
      </div>
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "resolved" ? "Mark as resolved" : "Close now"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => dialog && run(dialog, note)}>{dialog === "resolved" ? "Mark resolved" : "Close now"}</Button>
          </>
        }
      >
        <Field
          label={dialog === "resolved" ? "What was done? (required)" : "Why close it now? (required)"}
          htmlFor={`note-${issueId}`}
          hint={dialog === "resolved" ? "Affected students will see this note and can confirm or dispute the fix." : "This ends the voting. Affected students will see your reason in the history."}
          error={error}
        >
          <Textarea id={`note-${issueId}`} value={note} onChange={(e) => { setNote(e.target.value); setError(null); }} maxLength={500} placeholder="e.g. Replaced the projector lamp and tested it." />
        </Field>
      </Modal>
    </>
  );
}
