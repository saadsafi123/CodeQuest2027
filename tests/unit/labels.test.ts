import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatUpdated, timeAgo } from "@/lib/format";
import { humanize, PRIORITY_CLASS, priorityLabel, roleLabel, STATUS_CLASS, statusLabel } from "@/lib/labels";

describe("labels: raw enum values never reach the screen", () => {
  it("maps every status and priority to words", () => {
    expect(["open", "in_progress", "resolved", "reopened", "closed", "needs_clarification"].map(statusLabel)).toEqual(["Open", "In progress", "Resolved", "Reopened", "Closed", "Needs clarification"]);
    expect(["critical", "high", "medium", "low"].map(priorityLabel)).toEqual(["Critical", "High", "Medium", "Low"]);
    expect(["student", "staff", "admin"].map(roleLabel)).toEqual(["Student", "Department staff", "Administrator"]);
  });
  it("humanizes unknown values instead of showing underscores", () => {
    expect(humanize("some_new_state")).toBe("Some new state");
    expect(statusLabel("waiting_for_parts")).toBe("Waiting for parts");
  });
  it("every status and priority has colour classes", () => {
    for (const k of ["open", "in_progress", "resolved", "confirmed", "reopened", "needs_clarification", "closed", "confidential"]) expect(STATUS_CLASS[k], k).toMatch(/bg-status-.*text-status-.*border-status-/);
    for (const k of ["critical", "high", "medium", "low"]) expect(PRIORITY_CLASS[k], k).toMatch(/bg-priority-.*text-priority-.*border-priority-/);
  });
});

describe("one date format everywhere", () => {
  const iso = "2026-11-24T14:05:00Z";
  it("formats dates and date-times the same way", () => {
    expect(formatDate(iso, "UTC")).toBe("24 Nov 2026");
    expect(formatDateTime(iso, "UTC")).toBe("24 Nov 2026, 14:05");
  });
  it("recent times are relative, older than a week are dates", () => {
    const now = new Date("2026-11-24T14:10:00Z").getTime();
    expect(formatUpdated(iso, now, "UTC")).toBe("5 min ago");
    expect(formatUpdated("2026-11-01T09:00:00Z", now, "UTC")).toBe("1 Nov 2026");
    expect(timeAgo(iso, new Date(iso).getTime() + 10_000)).toBe("just now");
  });
});
