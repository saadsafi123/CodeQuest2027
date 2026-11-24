// One department list, one place for the names, no separate "Labs" department.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import campus from "@/data/campus.json";
import seed from "@/data/seed-users.json";
import { DEPARTMENT_CODES, DEPARTMENT_NAMES, departmentLabel, departmentName } from "@/lib/departments";
import { DEPARTMENTS } from "@/lib/db/repositories/types";
import { DEPARTMENT_VALUES } from "@/lib/ai/schema";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { listLocations } from "@/lib/rules/location";

const ROOT = path.resolve(__dirname, "../..");

describe("departments", () => {
  it("the code list in the app equals src/data/departments.json", () => {
    expect([...DEPARTMENTS]).toEqual(DEPARTMENT_CODES);
    expect(DEPARTMENT_CODES).toEqual(["EE", "CSE", "IS", "Library", "Cafeteria"]);
  });

  it("CSE is Computer Software Engineering, read from the one data file", () => {
    expect(DEPARTMENT_NAMES.CSE).toBe("Computer Software Engineering");
    expect(departmentName("CSE")).toBe("Computer Software Engineering");
    expect(departmentLabel("CSE")).toBe("CSE (Computer Software Engineering)");
    expect(departmentName(null)).toBe("");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("CSE = Computer Software Engineering");
  });

  it("there is no Labs department for users: not in the AI values, seed users, gazetteer owners or the prompt's list", () => {
    expect(DEPARTMENT_CODES).not.toContain("Labs");
    expect([...DEPARTMENT_VALUES]).not.toContain("Labs");
    expect(seed.users.some((u) => u.department === "Labs" || /labs staff/i.test(u.name))).toBe(false);
    expect(listLocations().every((l) => l.owner === null || DEPARTMENT_CODES.includes(l.owner))).toBe(true);
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("There is no separate labs department");
    expect(seed.users.filter((u) => u.role === "staff").map((u) => u.department).sort()).toEqual([...DEPARTMENT_CODES].sort());
  });

  it("every lab belongs to its parent department", () => {
    const owner = (id: string) => listLocations().find((l) => l.id === id)?.owner;
    expect(["ee-lab-1", "ee-lab-2"].map(owner)).toEqual(["EE", "EE"]);
    expect(["cse-sc-lab", "cse-db-lab", "cse-networking-lab"].map(owner)).toEqual(["CSE", "CSE", "CSE"]);
    expect(["is-lab-1", "is-lab-2"].map(owner)).toEqual(["IS", "IS"]);
    expect(campus.locations.length).toBeGreaterThan(0);
  });

  it("no source file or doc uses another name for CSE (the name lives only in departments.json)", () => {
    const bad = /Computer Science (&|and) Engineering|Computer Science|Computing Science/i;
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const full = path.join(dir, f);
        if (f === "node_modules" || f === ".next" || f === "DECISIONS.md" || f.endsWith(".pdf")) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|json|md|sql)$/.test(f) && !full.endsWith(path.join("tests", "unit", "departments.test.ts"))) {
          const txt = readFileSync(full, "utf8");
          // campus.json keeps "computer science block" only as a student-written ALIAS of the CSE block
          if (bad.test(txt) && !full.endsWith("campus.json")) hits.push(path.relative(ROOT, full));
        }
      }
    };
    for (const d of ["src", "docs", "tests", "scripts"]) walk(path.join(ROOT, d));
    for (const f of ["CLAUDE.md", ".env.example"]) if (bad.test(readFileSync(path.join(ROOT, f), "utf8"))) hits.push(f);
    expect(hits).toEqual([]);
  });
});
