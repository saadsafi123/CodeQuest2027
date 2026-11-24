"use client";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "./cn";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}
const Ctx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.tone === "error" ? 7000 : 4500);
  }, []);
  const value = useMemo(() => push, [push]);
  const Icon = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "rf-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-card)] border bg-surface p-3.5 shadow-[var(--shadow-pop)]",
                t.tone === "success" && "border-status-resolved-border",
                t.tone === "error" && "border-priority-critical-border",
                t.tone === "info" && "border-line",
              )}
            >
              <I className={cn("mt-0.5 size-5 shrink-0", t.tone === "success" && "text-status-resolved-fg", t.tone === "error" && "text-priority-critical-fg", t.tone === "info" && "text-status-open-fg")} aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-muted">{t.body}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
