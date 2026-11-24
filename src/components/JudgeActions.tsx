"use client";
// Purpose: the data-changing judge actions: create a brand-new student, reset all data.
import { RotateCcw, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardBody, Field, Input, Modal, useToast } from "@/components/ui";

export function CreateStudentCard() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() || undefined }) });
    setBusy(false);
    if (!res.ok) return toast({ tone: "error", title: "Could not create the student", body: "Is the database connected?" });
    const { user } = await res.json();
    toast({ tone: "success", title: `Created ${user.name}`, body: "You are now signed in as this new student." });
    setName("");
    router.push("/student");
    router.refresh();
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={create} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><UserPlus className="size-5" aria-hidden /></span>
            <h2 className="text-lg font-semibold">Create a new student</h2>
          </div>
          <p className="text-sm text-muted">Instant account, no password. New accounts start with the default trust score and count for less until they have history.</p>
          <Field label="Name (optional)" htmlFor="new-student-name">
            <Input id="new-student-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Judge Student" />
          </Field>
          <Button type="submit" loading={busy} className="w-full">Create student and sign in</Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function ResetCard() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    const res = await fetch("/api/admin/reset", { method: "POST" });
    setBusy(false);
    setOpen(false);
    if (!res.ok) return toast({ tone: "error", title: "Reset failed", body: "Check the database status chip and run npm run db:check." });
    toast({ tone: "success", title: "All data reset", body: "Demo users were reseeded." });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-danger-50 text-danger-600"><RotateCcw className="size-5" aria-hidden /></span>
            <h2 className="text-lg font-semibold">Reset all data</h2>
          </div>
          <p className="text-sm text-muted">Deletes every report, issue and account, then reseeds the demo users. Use it between test rounds.</p>
          <Button variant="danger" className="w-full" onClick={() => setOpen(true)}>Reset all data</Button>
        </CardBody>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reset all data?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={reset}>Yes, reset everything</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">This permanently removes all reports, issues, votes, trust history and any accounts you created, then restores the demo users. It cannot be undone.</p>
      </Modal>
    </>
  );
}
