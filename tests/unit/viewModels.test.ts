import { describe, expect, it } from "vitest";
import { dailyCounts, departmentLoad, hotPlaces, oldestWaitingHours } from "@/lib/viewModels";
import type { IssueSummary } from "@/lib/services/issueService";

const NOW = new Date("2026-11-24T12:00:00").getTime();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const issue = (o: Partial<IssueSummary>): IssueSummary =>
  ({ id: "x", title: "t", location: { id: "l", name: "Networking Lab" }, department: "CSE", priority: "medium", status: "open", meToo: 1, reason: null, createdAt: day(0), updatedAt: day(0), confidential: false, needsDepartment: false, myRole: null, allowedMoves: [], myVote: null, needsMyVote: false, ...o }) as IssueSummary;

describe("dashboard view models", () => {
  it("dailyCounts: one bucket per day, oldest first, ignores older items", () => {
    const c = dailyCounts([{ d: day(0) }, { d: day(0) }, { d: day(2) }, { d: day(30) }], (x) => x.d, 5, NOW);
    expect(c).toEqual([0, 0, 1, 0, 2]);
  });

  it("departmentLoad counts only ACTIVE issues and names departments in full", () => {
    const bars = departmentLoad([issue({}), issue({}), issue({ department: "EE" }), issue({ status: "closed" }), issue({ department: null })]);
    expect(bars.map((b) => [b.label, b.value])).toEqual([["Computer Software Engineering", 2], ["Electrical Engineering", 1], ["Needs a department", 1]].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(bars.find((b) => b.label === "Needs a department")!.tone).toBe("warn");
  });

  it("hotPlaces ranks places and marks critical ones", () => {
    const bars = hotPlaces([issue({}), issue({ meToo: 3 }), issue({ location: { id: "d", name: "DB Lab" }, priority: "critical" })], 5);
    expect(bars[0]).toMatchObject({ label: "Networking Lab", value: 2, note: "2 issues · 4 affected" });
    expect(bars[1]).toMatchObject({ label: "DB Lab", tone: "danger" });
  });

  it("oldestWaitingHours", () => {
    expect(oldestWaitingHours([issue({ status: "closed" })], NOW)).toBeNull();
    expect(Math.round(oldestWaitingHours([issue({ createdAt: day(2) }), issue({ createdAt: day(1) })], NOW)!)).toBe(48);
  });
});
