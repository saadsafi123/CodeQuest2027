"use client";
// Purpose: the AI-written briefing on the admin overview. Loaded after the page so the AI call never slows the page down.
// Shows whether it was written by the AI or by the plain-rules fallback.
import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, SkeletonText } from "@/components/ui";
import { timeAgo } from "@/lib/format";

interface View {
  headline: string;
  highlights: string[];
  watch: string[];
  mode: "gemini" | "fallback";
  generatedAt: string;
}

async function fetchSummary(refresh: boolean): Promise<{ data?: View; error?: string }> {
  const res = await fetch(`/api/admin/summary${refresh ? "?refresh=1" : ""}`, { cache: "no-store" }).catch(() => null);
  const json = await res?.json().catch(() => null);
  if (!res || !res.ok) return { error: json?.error ?? "Could not load the summary." };
  return { data: json.summary };
}

export function AdminSummary() {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = (r: { data?: View; error?: string }) => {
    setLoading(false);
    setError(r.error ?? null);
    if (r.data) setData(r.data);
  };

  function refresh() {
    setLoading(true);
    void fetchSummary(true).then(apply);
  }

  useEffect(() => {
    let alive = true;
    void fetchSummary(false).then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader
        title="Summary"
        subtitle="A short briefing written from the live numbers"
        action={
          <div className="flex items-center gap-2">
            {data && <Badge tone={data.mode === "gemini" ? "brand" : "neutral"} icon={<Sparkles className="size-3.5" aria-hidden />}>{data.mode === "gemini" ? "Written by AI" : "Rule-based (AI unavailable)"}</Badge>}
            <Button type="button" size="sm" variant="secondary" loading={loading} onClick={refresh}>
              {!loading && <RefreshCw className="size-3.5" aria-hidden />}Refresh
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-3">
        {loading && !data ? (
          <SkeletonText lines={4} />
        ) : error ? (
          <p className="text-sm text-danger-600">{error}</p>
        ) : data ? (
          <div className="space-y-3" data-testid="admin-summary">
            <p className="font-semibold text-ink">{data.headline}</p>
            {data.highlights.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
                {data.highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
            {data.watch.length > 0 && (
              <div className="rounded-[var(--radius-card)] border border-line bg-sunken p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Needs your attention</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {data.watch.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted">Generated {timeAgo(data.generatedAt)}. Numbers come from the system; the AI only writes the wording and never sees student names or confidential reports.</p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
