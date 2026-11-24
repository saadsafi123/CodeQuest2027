"use client";
// Purpose: staff/admin flag a report as spam / fake / abuse. The server checks that the user owns the issue's
// department (or is admin); this only shows the dialog. The author's identity is never shown or needed here.
import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Modal, Select, Textarea, useToast } from "@/components/ui";
import { announceTrustMayHaveChanged } from "./LiveTrust";

export function FlagReport({ reportId }: { reportId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"spam" | "fake" | "abuse">("fake");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/reports/${reportId}/flag`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, note }) }).catch(() => null);
    setBusy(false);
    const json = await res?.json().catch(() => null);
    if (!res || !res.ok) return toast({ tone: "error", title: "Report not flagged", body: json?.error ?? "Try again." });
    toast({ tone: "success", title: "Report flagged", body: json.flag.closed ? "Nothing else was reported, so the issue was closed." : `${json.flag.meTooCount} students still counted.` });
    setOpen(false);
    setNote("");
    announceTrustMayHaveChanged();
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Flag this report as spam, fake or abuse">
        <Flag className="size-3.5" aria-hidden /> Flag
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Flag this report"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={submit}>Flag report</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">The report stops counting toward this issue and the author&rsquo;s trust score goes down (the change appears in their trust ledger with this reason).</p>
          <Field label="What is wrong with it?" htmlFor={`flag-kind-${reportId}`}>
            <Select id={`flag-kind-${reportId}`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="fake">Fake: the problem does not exist (-10)</option>
              <option value="spam">Spam: meaningless or repeated (-10)</option>
              <option value="abuse">Abuse: misusing the system (-15)</option>
            </Select>
          </Field>
          <Field label="Note (optional)" htmlFor={`flag-note-${reportId}`}>
            <Textarea id={`flag-note-${reportId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
