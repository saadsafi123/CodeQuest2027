"use client";
// Purpose: "Is it really fixed?" box. Live tallies of the current resolution round (counts only, never names) and,
// for an affected student, the confirm / dispute buttons. Eligibility and weight are decided on the SERVER; this only
// renders. The chosen button answers instantly (optimistic) and rolls back with a message if the server refuses.
import { CheckCircle2, Clock, Hourglass, RotateCcw, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, InfoTip, useToast } from "@/components/ui";
import { LiveRefresh } from "./LiveRefresh";
import { announceTrustMayHaveChanged } from "./LiveTrust";

export interface VotingProps {
  round: number;
  open: boolean;
  members: number;
  confirmN: number;
  disputeN: number;
  waiting: number;
  disputeShare: number;
  disputersNeeded: number;
  shareNeeded: number;
  rule: string;
  myVote: "confirm" | "dispute" | null;
  canVote: boolean;
  deadline: string | null;
  windowHours: number;
  confirmShareOfPool: number;
  confirmersNeeded: number;
  closeRule: string;
  lateJoiner: boolean;
}

/** "47 h 52 min", "12 min 05 s", "ended". Re-renders every second while under 10 minutes, otherwise every 20 s. */
function useCountdown(deadline: string | null, active: boolean): { text: string; ended: boolean } | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline || !active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [deadline, active]);
  if (!deadline || !active || now === null) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return { text: "ended", ended: true };
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const text = h >= 1 ? `${h} h ${String(m).padStart(2, "0")} min` : m >= 1 ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
  return { text, ended: false };
}

export function VotePanel({ issueId, voting, status, viewer }: { issueId: string; voting: VotingProps; status: string; viewer: "student" | "staff" | "admin" }) {
  const router = useRouter();
  const toast = useToast();
  const [choice, setChoice] = useState<"confirm" | "dispute" | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = voting.myVote ?? choice;
  // optimistic: show my vote in the tally until the refreshed page includes it
  const bump = choice && !voting.myVote;
  const confirmN = voting.confirmN + (bump && choice === "confirm" ? 1 : 0);
  const disputeN = voting.disputeN + (bump && choice === "dispute" ? 1 : 0);
  const waiting = Math.max(0, voting.members - confirmN - disputeN);
  const pct = (n: number) => (voting.members ? (n / voting.members) * 100 : 0);

  async function cast(vote: "confirm" | "dispute") {
    setChoice(vote);
    setBusy(true);
    const res = await fetch("/api/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ issueId, vote }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setChoice(null); // roll back
      return toast({ tone: "error", title: "Vote not counted", body: json?.error ?? "Could not reach the server. Try again." });
    }
    toast({ tone: json.vote.outcome === "reopened" ? "info" : "success", title: vote === "confirm" ? "Thanks, you confirmed the fix" : "Thanks, you disputed the fix", body: json.vote.message });
    announceTrustMayHaveChanged();
    router.refresh();
  }

  const closed = status === "closed";
  const reopened = status === "reopened";
  const countdown = useCountdown(voting.deadline, voting.open);
  // the window ended while the page was open: ask the server to settle it (it closes lazily on read)
  useEffect(() => {
    if (countdown?.ended) router.refresh();
  }, [countdown?.ended, router]);
  const showButtons = viewer === "student" && voting.open && voting.canVote && !mine;

  return (
    <Card className={reopened ? "border-warn-600/40" : voting.open && voting.canVote ? "border-brand-200 bg-brand-50/50" : undefined}>
      <LiveRefresh active={voting.open || reopened} />
      <CardHeader
        title={<span className="inline-flex items-center gap-1">{voting.open ? "Is it really fixed?" : reopened ? "Reopened after disputes" : closed ? "Fix confirmed" : "Votes on the fix"}<InfoTip term={reopened ? "reopen" : "votingWindow"} /></span>}
        subtitle={`Round ${voting.round} · ${voting.members} affected ${voting.members === 1 ? "student" : "students"}`}
        action={
          reopened ? <Badge tone="warn" icon={<RotateCcw className="size-3.5" aria-hidden />}>Reopened</Badge> : closed ? <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Closed</Badge> : voting.open ? <Badge tone="brand" icon={<Vote className="size-3.5" aria-hidden />}>Voting open</Badge> : undefined
        }
      />
      <CardBody className="space-y-4">
        {voting.open && voting.deadline && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sunken px-3 py-2 text-sm text-ink-soft" role="timer" aria-live="off">
            <Clock className="size-4 shrink-0 text-brand-600" aria-hidden />
            {countdown?.ended ? (
              <strong>Voting window ended. Closing the issue…</strong>
            ) : (
              <>
                <span>Voting closes in <strong>{countdown?.text ?? "…"}</strong></span>
                <span className="text-muted">· {new Date(voting.deadline).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </>
            )}
          </p>
        )}
        {voting.lateJoiner && (
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-soft">
            You joined after the fix was reported, so your vote is not counted in this round. You can vote if the issue is resolved again.
          </p>
        )}
        {voting.open && viewer === "student" && !mine && voting.canVote && (
          <p className="text-sm text-ink-soft">Staff marked this as resolved. Only students affected by this issue can say whether it is really fixed.</p>
        )}
        {reopened && <p className="text-sm text-ink-soft">Enough affected students disputed the fix, so the issue went back to the department and a new round of votes starts when it is resolved again.</p>}
        {closed && <p className="text-sm text-ink-soft">Everyone affected confirmed the fix, so the issue is closed.</p>}

        {showButtons && (
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="primary" disabled={busy} onClick={() => cast("confirm")} aria-label="Confirm the fix">
              <ThumbsUp className="size-4" aria-hidden /> Yes, fixed
            </Button>
            <Button size="lg" variant="danger" disabled={busy} onClick={() => cast("dispute")} aria-label="Dispute the fix">
              <ThumbsDown className="size-4" aria-hidden /> Still broken
            </Button>
          </div>
        )}
        {mine && (
          <p className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm font-semibold text-ink-soft" role="status">
            {busy ? <Hourglass className="size-4 animate-pulse" aria-hidden /> : <CheckCircle2 className="size-4 text-ok-600" aria-hidden />}
            {busy ? "Counting your vote…" : mine === "confirm" ? "You confirmed the fix." : "You disputed the fix."}
            {voting.open && !busy && waiting > 0 && <span className="font-normal text-muted"> Waiting for {waiting} more.</span>}
          </p>
        )}
        {viewer !== "student" && voting.open && <p className="text-sm text-muted">Affected students are voting. You will see the result here.</p>}

        <div>
          <div
            className="flex h-3 overflow-hidden rounded-full bg-sunken"
            role="img"
            aria-label={`${confirmN} confirmed, ${disputeN} disputed, ${waiting} not voted yet`}
          >
            <div className="bg-ok-600 transition-all duration-500" style={{ width: `${pct(confirmN)}%` }} />
            <div className="bg-danger-600 transition-all duration-500" style={{ width: `${pct(disputeN)}%` }} />
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
            <div><dt className="text-xs text-muted">Confirmed</dt><dd className="font-display text-xl font-semibold text-ok-600">{confirmN}</dd></div>
            <div><dt className="text-xs text-muted">Disputed</dt><dd className="font-display text-xl font-semibold text-danger-600">{disputeN}</dd></div>
            <div><dt className="text-xs text-muted">Not voted</dt><dd className="font-display text-xl font-semibold text-ink-soft">{waiting}</dd></div>
          </dl>
        </div>

        {voting.open && (
          <div className="rounded-xl bg-brand-50/70 px-3 py-2 text-xs text-ink-soft">
            <p className="flex items-center gap-1 font-semibold text-brand-700">Early close progress<InfoTip term="earlyClose" /></p>
            <p>
              {confirmN} of {voting.confirmersNeeded} confirmations needed · {Math.round(voting.confirmShareOfPool * 100)}% of the weight (more than 50% closes it).
            </p>
          </div>
        )}
        <p className="border-t border-line pt-3 text-xs text-muted">
          {voting.rule} {voting.closeRule} Votes from established students count a little more than votes from brand-new accounts.
          {voting.open && disputeN > 0 && ` So far: ${disputeN} of ${voting.disputersNeeded} disputers needed, ${Math.round(voting.disputeShare * 100)}% of the vote weight (50% needed).`}
        </p>
      </CardBody>
    </Card>
  );
}
