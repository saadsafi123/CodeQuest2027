// Purpose: small, unobtrusive system status (AI mode + database). Server component; details open on click.
import { Database, Sparkles } from "lucide-react";
import { getAiStatus } from "@/lib/ai/keyPool";
import { checkDatabase } from "@/lib/db/check";
import { cn } from "@/components/ui";

export async function StatusChip() {
  const ai = getAiStatus();
  const db = await checkDatabase(3000).catch(() => null);
  const dbOk = db?.ok === true;
  const aiOk = ai.mode === "gemini";
  const healthy = dbOk && aiOk;

  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-[4px] border px-2.5 py-1 text-xs font-medium transition-colors [&::-webkit-details-marker]:hidden",
          !dbOk ? "border-priority-critical-border bg-priority-critical-bg text-priority-critical-fg" : healthy ? "border-status-resolved-border bg-status-resolved-bg text-status-resolved-fg" : "border-status-progress-border bg-status-progress-bg text-status-progress-fg",
        )}
      >
        <span className={cn("size-2 rounded-full", !dbOk ? "bg-priority-critical-fg" : healthy ? "bg-status-resolved-fg" : "bg-status-progress-fg")} aria-hidden />
        <span className="hidden sm:inline">{!dbOk ? "Database problem" : aiOk ? "All systems ready" : "Fallback AI mode"}</span>
        <span className="sm:hidden">{!dbOk ? "DB" : aiOk ? "OK" : "Fallback"}</span>
      </summary>
      <div className="rf-pop-in absolute right-0 z-40 mt-2 w-72 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm shadow-[var(--shadow-pop)]">
        <div className="flex gap-3">
          <Sparkles className={cn("mt-0.5 size-4 shrink-0", aiOk ? "text-status-resolved-fg" : "text-status-progress-fg")} aria-hidden />
          <div>
            <p className="font-semibold">{aiOk ? "Gemini AI" : "Fallback mode"}</p>
            <p className="text-muted">
              {aiOk
                ? `${ai.keysAvailable}/${ai.keysTotal} keys available${ai.keysCoolingDown ? `, ${ai.keysCoolingDown} cooling down` : ""}${ai.keysDisabled ? `, ${ai.keysDisabled} unusable` : ""}.`
                : ai.keysTotal === 0
                  ? "No Gemini keys set. Rule-based understanding is used."
                  : "Keys unavailable or AI_MODE=fallback. Rule-based understanding is used."}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-3 border-t border-line pt-3">
          <Database className={cn("mt-0.5 size-4 shrink-0", dbOk ? "text-status-resolved-fg" : "text-priority-critical-fg")} aria-hidden />
          <div>
            <p className="font-semibold">{dbOk ? "Database connected" : "Database problem"}</p>
            {!dbOk && (
              <p className="text-muted">
                {db?.message ?? "Cannot reach the database."} {db?.fixes[0]} <span className="text-xs">(run npm run db:check)</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
