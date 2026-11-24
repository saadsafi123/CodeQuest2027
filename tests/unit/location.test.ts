import { describe, expect, it } from "vitest";
import campus from "@/data/campus.json";
import {
  decideLocation,
  findLocationInText,
  gazetteerEntries,
  getLocationById,
  listLocations,
  locationTokens,
  resolveLocation,
} from "@/lib/rules/location";

const id = (m: string | null) => {
  const r = resolveLocation(m);
  return r.status === "resolved" ? r.location.id : r.status;
};

describe("gazetteer data", () => {
  it("has the real labs with the right owners, flagged real", () => {
    const real: Record<string, string> = {
      "ee-lab-1": "EE", "ee-lab-2": "EE",
      "cse-sc-lab": "CSE", "cse-db-lab": "CSE", "cse-networking-lab": "CSE",
      "is-lab-1": "IS", "is-lab-2": "IS",
    };
    for (const [k, owner] of Object.entries(real)) {
      const l = getLocationById(k);
      expect(l, k).not.toBeNull();
      expect(l!.owner).toBe(owner);
      expect(l!.source).toBe("real");
    }
    expect(listLocations().filter((l) => l.source === "real")).toHaveLength(7);
    expect(campus._REAL_ENTRIES).toHaveLength(7);
  });

  it("ids are unique, every entry has an owner or is explicitly ownerless, every variant is non-empty", () => {
    const ids = listLocations().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of gazetteerEntries()) expect(e.variants.length, e.id).toBeGreaterThan(0);
  });

  it("no two places share an identical alias (would silently shadow each other)", () => {
    const seen = new Map<string, string>();
    for (const e of gazetteerEntries()) {
      for (const v of new Set(e.variants.map((t) => t.join(" ")))) {
        const prev = seen.get(v);
        expect(prev === undefined || prev === e.id, `alias "${v}" shared by ${prev} and ${e.id}`).toBe(true);
        seen.set(v, e.id);
      }
    }
  });

  it("no unqualified generic alias such as 'lab 1' exists (those must stay ambiguous)", () => {
    for (const e of gazetteerEntries()) {
      for (const v of e.variants) expect(["lab 1", "lab 2", "lab", "ee lab"]).not.toContain(v.join(" "));
    }
  });
});

describe("normalization", () => {
  it("handles digits glued to letters, number words, Roman Urdu numerals and fillers", () => {
    expect(locationTokens("EE Lab1")).toEqual(["ee", "lab", "1"]);
    expect(locationTokens("lab no. 2 mein")).toEqual(["lab", "2"]);
    expect(locationTokens("ee lab ek")).toEqual(["ee", "lab", "1"]);
    expect(locationTokens("the Laboratory three")).toEqual(["lab", "3"]);
  });
});

describe("resolveLocation: real labs, any spelling", () => {
  it.each([
    ["EE Lab 1", "ee-lab-1"],
    ["ee lab1", "ee-lab-1"],
    ["EE LAB 2", "ee-lab-2"],
    ["ee lab do", "ee-lab-2"],
    ["ee ki pehli lab", "ee-lab-1"],
    ["electrical lab 2", "ee-lab-2"],
    ["SC Lab", "cse-sc-lab"],
    ["sc wali lab", "cse-sc-lab"],
    ["cse sc lab", "cse-sc-lab"],
    ["DB lab", "cse-db-lab"],
    ["database lab", "cse-db-lab"],
    ["databse lab", "cse-db-lab"],
    ["db ki lab mein", "cse-db-lab"],
    ["dbms lab", "cse-db-lab"],
    ["networking lab", "cse-networking-lab"],
    ["net lab", "cse-networking-lab"],
    ["network lab", "cse-networking-lab"],
    ["netwroking lab", "cse-networking-lab"],
    ["networkin lab", "cse-networking-lab"],
    ["CN lab", "cse-networking-lab"],
    ["IS Lab 1", "is-lab-1"],
    ["is lab2", "is-lab-2"],
    ["IT lab 2", "is-lab-2"],
    ["is lab ek", "is-lab-1"],
    ["information systems lab 2", "is-lab-2"],
  ])("%s -> %s", (mention, expected) => {
    expect(id(mention)).toBe(expected);
  });

  it("accepts a distinctive fragment when nothing else matches", () => {
    expect(id("networking")).toBe("cse-networking-lab");
    expect(id("database")).toBe("cse-db-lab");
  });

  it("extra words around the place name do not matter", () => {
    expect(id("projector in the networking lab near gate")).toBe("cse-networking-lab");
  });
});

describe("resolveLocation: placeholder places", () => {
  it.each([
    ["library", "library"],
    ["Libary", "library"],
    ["library reading hall", "library-reading-hall"],
    ["reading room", "library-reading-hall"],
    ["canteen", "cafeteria"],
    ["cafetaria", "cafeteria"],
    ["room 101", "cse-room-101"],
    ["kamra 201", "cse-room-201"],
    ["server room", "is-server-room"],
    ["main gate", "main-gate"],
    ["parking", "parking"],
  ])("%s -> %s", (mention, expected) => {
    expect(id(mention)).toBe(expected);
  });
});

describe("never guesses", () => {
  it("ambiguous: the same lab number exists in two departments", () => {
    const r = resolveLocation("lab 1");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidates.map((c) => c.id).sort()).toEqual(["ee-lab-1", "is-lab-1"]);
    expect(id("lab 2")).toBe("ambiguous");
  });
  it("ambiguous: department known, number missing", () => {
    const r = resolveLocation("ee lab");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidates.map((c) => c.id).sort()).toEqual(["ee-lab-1", "ee-lab-2"]);
  });
  it("vague: only a kind of place", () => {
    const r = resolveLocation("lab");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      expect(r.vague).toBe(true);
      expect(r.candidates.length).toBeGreaterThanOrEqual(7);
    }
    expect(id("room")).toBe("ambiguous");
    expect(id("hall")).toBe("ambiguous"); // only one hall exists, but "the hall" names nothing specific
  });
  it("unknown: a lab number that does not exist", () => {
    expect(id("lab 3")).toBe("unknown");
    expect(id("lab 7")).toBe("unknown");
    expect(id("ee lab 3")).toBe("unknown");
    expect(id("room 999")).toBe("unknown");
    expect(id("room 999 of the quantum block")).toBe("unknown");
    expect(id("quantum block")).toBe("unknown");
  });
  it("a contradicting department qualifier rejects the place instead of ignoring it", () => {
    expect(id("ee sc lab")).toBe("unknown");
    expect(id("cse lab 1")).toBe("unknown");
    expect(id("is networking lab")).toBe("unknown");
  });
  it("unknown places come with sensible suggestions", () => {
    const r = resolveLocation("cse lab 1");
    expect(r.status).toBe("unknown");
    if (r.status === "unknown") {
      const names = r.suggestions.map((s) => s.name);
      expect(names).toEqual(expect.arrayContaining(["SC Lab", "DB Lab", "Networking Lab"]));
      expect(names.length).toBeLessThanOrEqual(4);
    }
  });
  it("none: nothing to match", () => {
    expect(resolveLocation(null).status).toBe("none");
    expect(resolveLocation("   ").status).toBe("none");
    expect(resolveLocation("the").status).toBe("none");
  });
  it("short typos in generic words are not auto-corrected", () => {
    expect(id("lib 1")).not.toBe("is-lab-1");
  });
});

describe("findLocationInText (only for a missing mention)", () => {
  it("finds a named place in free text", () => {
    expect(findLocationInText("the projector in the networking lab is dead").status).toBe("resolved");
    expect(findLocationInText("wifi is slow").status).toBe("none");
    expect(findLocationInText("ee lab 1 aur is lab 1 dono mein problem hai").status).toBe("ambiguous");
  });
});

describe("decideLocation", () => {
  const D = (m: string | null, t = "", confidential = false) => decideLocation(m, t, { confidential });

  it("resolves a good mention", () => {
    const d = D("networking lab", "projector broken");
    expect(d).toMatchObject({ status: "resolved", reason: null, question: null });
    expect(d.location?.owner).toBe("CSE");
  });

  it("unknown place -> needs clarification with a question, not routed", () => {
    const d = D("Room 999 of the Quantum Block", "AC not working in Room 999 of the Quantum Block");
    expect(d.status).toBe("needs_clarification");
    expect(d.reason).toBe("unknown_place");
    expect(d.location).toBeNull();
    expect(d.question).toContain("couldn't find");
  });

  it("a specific unknown mention is NOT rescued by another place named elsewhere in the text", () => {
    const d = D("room 999", "AC broken in room 999, next to the library and the networking lab");
    expect(d.status).toBe("needs_clarification");
    expect(d.location).toBeNull();
  });

  it("generic mention is rescued by a place named in the text", () => {
    expect(D("lab", "the projector in the db lab is dead")).toMatchObject({ status: "resolved" });
    expect(D(null, "db lab ka projector kharab hai").location?.id).toBe("cse-db-lab");
  });

  it("no mention and no place in the text -> asks where", () => {
    const d = D(null, "wifi is very slow today");
    expect(d.status).toBe("needs_clarification");
    expect(d.reason).toBe("no_location");
    expect(d.question).toMatch(/Where is this problem/);
  });

  it("vague and ambiguous mentions list options", () => {
    const v = D("lab", "something broken in the lab");
    expect(v).toMatchObject({ status: "needs_clarification", reason: "vague_place" });
    expect(v.suggestions.length).toBeGreaterThan(0);
    const a = D("lab 1", "lab 1 projector");
    expect(a).toMatchObject({ status: "needs_clarification", reason: "ambiguous_place" });
    expect(a.question).toMatch(/EE Lab 1/);
    expect(a.question).toMatch(/IS Lab 1/);
  });

  it("confidential reports never block on location", () => {
    expect(D("room 999", "ragging", true)).toMatchObject({ status: "not_required", question: null, suggestions: [] });
    expect(D("networking lab", "ragging", true).status).toBe("resolved");
  });

  it("echoes only a clipped mention back in the question", () => {
    const d = D("x".repeat(500) + " block", "t");
    expect(d.question!.length).toBeLessThan(400);
  });
});
