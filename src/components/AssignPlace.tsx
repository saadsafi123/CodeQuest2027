"use client";
// Purpose: admin picks the place for a report whose clarification limit was reached.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Select, useToast } from "@/components/ui";

export function AssignPlace({ reportId, places }: { reportId: string; places: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function assign() {
    setBusy(true);
    const res = await fetch("/api/admin/assign-location", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, locationId: value }) }).catch(() => null);
    setBusy(false);
    const json = await res?.json().catch(() => null);
    if (!res || !res.ok) return toast({ tone: "error", title: "Could not assign the place", body: json?.error });
    toast({ tone: "success", title: "Report routed", body: json.report.message });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <label htmlFor={`place-${reportId}`} className="sr-only">Place</label>
      <Select id={`place-${reportId}`} value={value} onChange={(e) => setValue(e.target.value)} className="w-56">
        <option value="">Choose a place…</option>
        {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Button size="md" disabled={!value} loading={busy} onClick={assign}>Assign and route</Button>
    </div>
  );
}
