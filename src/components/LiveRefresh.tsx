"use client";
// Purpose: keep a server-rendered page live (vote tallies, "reopened" notices) by re-fetching it while the tab is visible.
// Cheap: router.refresh() re-renders server components only; it pauses in background tabs.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveRefresh({ active = true, everyMs = 7000 }: { active?: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, everyMs, router]);
  return null;
}
