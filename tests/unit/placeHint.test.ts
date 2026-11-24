// The optional department -> place picker is only a HINT (rules/placeHint.ts). Real gazetteer, no mocks.
import { describe, expect, it } from "vitest";
import { cleanHint, placesOfDepartment, reconcilePlace } from "@/lib/rules/placeHint";
import { decideLocation } from "@/lib/rules/location";

const D = (mention: string | null, text: string) => decideLocation(mention, text, { confidential: false });
const R = (mention: string | null, text: string, hint: { department?: string; locationId?: string } | null) => reconcilePlace(D(mention, text), hint, false);

describe("the text names a clear place: the text wins when they agree, we ASK when they conflict", () => {
  const text = "projector kharab hai networking lab mein";
  it("no hint, or an agreeing hint -> resolved from the text", () => {
    expect(R("networking lab", text, null)).toMatchObject({ kind: "resolved", source: "text", location: { id: "cse-networking-lab" } });
    expect(R("networking lab", text, { department: "CSE", locationId: "cse-networking-lab" })).toMatchObject({ kind: "resolved", source: "text" });
    expect(R("networking lab", text, { department: "CSE" })).toMatchObject({ kind: "resolved", source: "text" });
  });
  it("a different picked place -> ask which is right, with both as tappable options", () => {
    const r = R("networking lab", text, { department: "EE", locationId: "ee-lab-1" });
    expect(r).toMatchObject({ kind: "ask", reason: "conflict" });
    if (r.kind !== "ask") return;
    expect(r.options.map((o) => [o.id, o.tag])).toEqual([["cse-networking-lab", "from_text"], ["ee-lab-1", "from_picker"]]);
    expect(r.question).toMatch(/Networking Lab.*EE Lab 1/);
  });
  it("a picked department that does not own the named place -> ask too", () => {
    const r = R("networking lab", text, { department: "EE" });
    expect(r).toMatchObject({ kind: "ask", reason: "conflict" });
    if (r.kind === "ask") expect(r.options[0]).toMatchObject({ id: "cse-networking-lab", tag: "from_text" });
  });
});

describe("the text names no place", () => {
  const text = "projector kharab hai";
  it("nothing picked -> 'Where is this problem?' (before anything is saved)", () => {
    expect(R(null, text, null)).toMatchObject({ kind: "ask", reason: "no_place", question: "Where is this problem?", options: [] });
  });
  it("a picked place is used", () => {
    expect(R(null, text, { locationId: "ee-lab-2" })).toMatchObject({ kind: "resolved", source: "picker", location: { id: "ee-lab-2" } });
  });
  it("only a department picked -> ask, with that department's places as options", () => {
    const r = R(null, text, { department: "EE" });
    expect(r).toMatchObject({ kind: "ask", reason: "no_place" });
    if (r.kind !== "ask") return;
    expect(r.options.length).toBeGreaterThan(2);
    expect(r.options.every((o) => o.owner === "EE")).toBe(true);
  });
});

describe("a place the text names but we cannot pin down", () => {
  it("a bare 'lab' asks which lab (all of them), narrowed to the picked department", () => {
    const none = R("lab", "projector not working in the lab", null);
    expect(none).toMatchObject({ kind: "ask", reason: "no_place" });
    if (none.kind === "ask") expect(none.options).toHaveLength(7);
    const ee = R("lab", "projector not working in the lab", { department: "EE" });
    expect(ee).toMatchObject({ kind: "ask" });
    if (ee.kind === "ask") expect(ee.options.map((o) => o.id).sort()).toEqual(["ee-lab-1", "ee-lab-2"]);
    expect(R("lab", "projector not working in the lab", { locationId: "is-lab-2" })).toMatchObject({ kind: "resolved", source: "picker", location: { id: "is-lab-2" } });
  });
  it("an ambiguous 'lab 1' is settled by a picked place that is one of its readings, or by the department", () => {
    expect(R("lab 1", "wifi down in lab 1", { locationId: "ee-lab-1" })).toMatchObject({ kind: "resolved", source: "picker", location: { id: "ee-lab-1" } });
    expect(R("lab 1", "wifi down in lab 1", { department: "IS" })).toMatchObject({ kind: "resolved", source: "picker", location: { id: "is-lab-1" } });
    expect(R("lab 1", "wifi down in lab 1", null)).toMatchObject({ kind: "defer" }); // normal saved clarification
  });
  it("an unknown place plus a picked place -> ask whether it is there (never silently trust the picker)", () => {
    const r = R("room 999 of the quantum block", "AC broken in room 999 of the quantum block", { locationId: "cse-db-lab" });
    expect(r).toMatchObject({ kind: "ask", reason: "unknown_with_hint" });
    if (r.kind === "ask") expect(r.options[0]).toMatchObject({ id: "cse-db-lab", tag: "from_picker" });
    expect(R("room 999 of the quantum block", "AC broken in room 999", null)).toMatchObject({ kind: "defer" });
  });
});

describe("hints are never trusted blindly", () => {
  it("an unknown place id or department is ignored", () => {
    expect(cleanHint({ locationId: "../../etc/passwd", department: "Labs" })).toEqual({ department: null, location: null });
    expect(cleanHint({ department: "Labs" }).department).toBeNull(); // there is no Labs department
    expect(R(null, "projector kharab hai", { locationId: "nope" })).toMatchObject({ kind: "ask", reason: "no_place" });
  });
  it("a confidential report never uses the picker", () => {
    expect(reconcilePlace(decideLocation(null, "ragging", { confidential: true }), { locationId: "ee-lab-1" }, true)).toEqual({ kind: "defer" });
  });
  it("placesOfDepartment lists the department's places, buildings first", () => {
    const p = placesOfDepartment("CSE");
    expect(p[0].type).toBe("building");
    expect(p.map((x) => x.id)).toEqual(expect.arrayContaining(["cse-sc-lab", "cse-db-lab", "cse-networking-lab"]));
  });
});
