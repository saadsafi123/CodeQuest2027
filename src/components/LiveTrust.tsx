"use client";
// Purpose: the trust score shown in the top bar and on the dashboard. The page is rendered once on the server and Next.js
// does NOT re-render the layout when you navigate inside the app, so a server-rendered number goes stale (for example
// after staff validate your report in another browser). This component starts from the server value and then asks the
// server for the LEDGER value: on mount, when the route changes, when the tab regains focus, every few seconds, and right
// after any action that can change trust (it listens for the "rf:trust" event).
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export const TRUST_EVENT = "rf:trust";
/** Call after a vote, a status change or a flag: the score may have changed. */
export function announceTrustMayHaveChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRUST_EVENT));
}

export function useLiveTrust(initial: number, enabled = true): number {
  // the last value the server confirmed, tied to the server-rendered value it replaced (a fresh server render wins)
  const [live, setLive] = useState<{ base: number; value: number } | null>(null);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json?.trust?.score === "number") setLive({ base: initial, value: json.trust.score });
    } catch {
      /* offline: keep the last value */
    }
  }, [initial]);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(refresh, 0);
    const tick = () => document.visibilityState === "visible" && void refresh();
    const id = setInterval(tick, 8000);
    window.addEventListener("focus", tick);
    window.addEventListener(TRUST_EVENT, refresh);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", tick);
      window.removeEventListener(TRUST_EVENT, refresh);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, refresh, pathname]);

  return live && live.base === initial ? live.value : initial;
}

export function LiveTrustValue({ initial }: { initial: number }) {
  return <>{Math.round(useLiveTrust(initial))}</>;
}
