"use client";
// Purpose: department -> place picker, used both as the OPTIONAL hint on the report form and inside the "Where is this
// problem?" question. It only collects a choice; the server decides what to do with it (rules/placeHint.ts).
import { Select } from "@/components/ui";

export interface PickerPlace {
  id: string;
  name: string;
  owner: string | null;
  type: string;
}
export interface PickerDepartment {
  code: string;
  name: string;
}

export function PlacePicker({
  departments,
  places,
  department,
  locationId,
  onChange,
  idPrefix = "pick",
}: {
  departments: PickerDepartment[];
  places: PickerPlace[];
  department: string;
  locationId: string;
  onChange: (v: { department: string; locationId: string }) => void;
  idPrefix?: string;
}) {
  const inDept = places
    .filter((p) => p.owner === department)
    .sort((a, b) => (a.type === "building" ? 0 : 1) - (b.type === "building" ? 0 : 1) || a.name.localeCompare(b.name));
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-dept`} className="mb-1 block text-sm font-semibold text-ink-soft">Department</label>
        <Select id={`${idPrefix}-dept`} className="w-full" value={department} onChange={(e) => onChange({ department: e.target.value, locationId: "" })}>
          <option value="">Not sure / skip</option>
          {departments.map((d) => (
            <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
          ))}
        </Select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-place`} className="mb-1 block text-sm font-semibold text-ink-soft">Place</label>
        <Select id={`${idPrefix}-place`} className="w-full" value={locationId} disabled={!department} onChange={(e) => onChange({ department, locationId: e.target.value })}>
          <option value="">{department ? "Choose a place" : "Pick a department first"}</option>
          {inDept.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
