"use client";
// Purpose: the inline "Where is this problem?" question. Shown BEFORE anything is saved or routed. The student taps an
// option (or picks any place with the department -> place picker) and the form re-sends the same text with that choice.
import { MapPin } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { PlacePromptView } from "@/lib/services/reportService";
import { PlacePicker, type PickerDepartment, type PickerPlace } from "./PlacePicker";

export function PlaceQuestion({
  prompt,
  departments,
  places,
  busy,
  onChoose,
  onCancel,
}: {
  prompt: PlacePromptView;
  departments: PickerDepartment[];
  places: PickerPlace[];
  busy: string | null;
  onChoose: (locationId: string) => void;
  onCancel: () => void;
}) {
  const [dept, setDept] = useState("");
  const [loc, setLoc] = useState("");
  const title = prompt.reason === "conflict" ? "Which place is right?" : "Where is this problem?";
  const TAG = { from_text: "from your text", from_picker: "you picked" } as const;
  return (
    <div className="rounded-[var(--radius-card)] border border-[#f1cdbd] bg-accent-50 p-4" role="group" aria-labelledby="place-q">
      <div className="flex gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-accent-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p id="place-q" className="font-semibold text-ink">{title}</p>
            {prompt.question !== title && <p className="mt-0.5 text-sm text-ink-soft" data-testid="place-question">{prompt.question}</p>}
            <p className="mt-0.5 text-xs text-muted">Nothing has been sent yet.</p>
          </div>
          {prompt.options.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested places">
              {prompt.options.map((o) => (
                <Button key={o.id} type="button" size="sm" variant="secondary" className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left" loading={busy === o.id} disabled={busy !== null} onClick={() => onChoose(o.id)}>
                  {o.name}
                  {o.department ? <span className="font-normal text-muted"> · {o.department}</span> : null}
                  {o.tag ? <span className="font-normal text-accent-600"> ({TAG[o.tag]})</span> : null}
                </Button>
              ))}
            </div>
          )}
          <div className="border-t border-[#f1cdbd] pt-3">
            <p className="mb-2 text-xs font-semibold text-muted">{prompt.options.length ? "Or choose another place" : "Choose the department, then the place"}</p>
            <PlacePicker departments={departments} places={places} department={dept} locationId={loc} onChange={(v) => { setDept(v.department); setLoc(v.locationId); }} idPrefix="ask" />
            <div className="mt-3 flex gap-2">
              <Button type="button" disabled={!loc || busy !== null} loading={busy === "picked"} onClick={() => onChoose(loc)}>Use this place</Button>
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={onCancel}>Edit my report</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
