"use client";
// Purpose: admin retries a saved report that never became an issue.
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";

export function RetryReport({ reportId }: { reportId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    const res = await fetch("/api/admin/retry-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId }) }).catch(() => null);
    setBusy(false);
    const json = await res?.json().catch(() => null);
    if (!res || !res.ok) return toast({ tone: "error", title: "Retry failed", body: json?.error ?? "Try again in a moment." });
    toast({ tone: "success", title: "Report routed", body: json.report.message });
    router.refresh();
  }

  return (
    <Button size="md" variant="secondary" loading={busy} onClick={retry}>
      <RefreshCw className="size-4" aria-hidden /> Retry
    </Button>
  );
}
