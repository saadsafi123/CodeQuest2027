// Notifications are DERIVED from permission-filtered reads. They must never carry more than the viewer may see:
// nothing about a confidential report for students or staff, and only a count (no text/place/author/id) for the admin.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/repositories", async () => (await import("../fakes")).repositoriesModule);

import { addAdmin, addStaff, addStudent, db, resetFakes } from "../fakes";
import { changeStatus } from "@/lib/services/issueService";
import { listNotifications } from "@/lib/services/notificationService";
import { clearAnalysisCache, ingestReport } from "@/lib/services/reportService";
import { DEPARTMENTS } from "@/lib/db/repositories/types";

type U = ReturnType<typeof addStudent>;
const submit = (u: U, t: string) => ingestReport(u as never, t);
const json = (x: unknown) => JSON.stringify(x);

let admin: ReturnType<typeof addAdmin>;
let staffBy: Record<string, ReturnType<typeof addStaff>>;
beforeEach(() => {
  resetFakes();
  clearAnalysisCache();
  admin = addAdmin();
  staffBy = Object.fromEntries(DEPARTMENTS.map((d) => [d, addStaff(d)]));
});

describe("student notifications", () => {
  it("vote needed, work started and reopened are derived from my issues; trust changes from my ledger", async () => {
    const [a, b] = [addStudent("A"), addStudent("B")];
    const v = await submit(a, "projector kharab hai networking lab mein");
    await submit(b, "networking lab ka projecter nahi chal raha");
    await changeStatus(staffBy.CSE as never, v.issue!.id, "in_progress", null);
    let n = await listNotifications(a as never);
    expect(n.map((x) => x.kind).sort()).toEqual(["trust", "work_started"]);
    await changeStatus(staffBy.CSE as never, v.issue!.id, "resolved", "Replaced the lamp");
    n = await listNotifications(b as never);
    const vote = n.find((x) => x.kind === "vote_needed")!;
    expect(vote).toMatchObject({ severity: "warn", href: `/student/issue/${v.issue!.id}` });
    expect(vote.body).toMatch(/Networking Lab/);
  });

  it("nothing about a confidential report, ever (even for its own reporter)", async () => {
    const zain = addStudent("Zain Raza");
    await submit(zain, "Seniors are ragging first year students behind the cafeteria RAGGINGMARKER");
    const issue = [...db.issues.values()][0];
    await changeStatus(admin as never, issue.id, "in_progress", null);
    await changeStatus(admin as never, issue.id, "resolved", "Handled");
    const n = await listNotifications(zain as never);
    expect(n).toEqual([]);
  });
});

describe("staff and admin notifications", () => {
  it("a critical issue pops up for the owning department only, as a critical notification with a link", async () => {
    const s = addStudent("S");
    const v = await submit(s, "db lab ke plug se chingariyan nikal rahi hain");
    const cse = await listNotifications(staffBy.CSE as never);
    expect(cse[0]).toMatchObject({ kind: "critical_issue", severity: "critical", href: `/staff/issue/${v.issue!.id}` });
    expect(await listNotifications(staffBy.EE as never)).toEqual([]);
    expect(await listNotifications(staffBy.Library as never)).toEqual([]);
    const adm = await listNotifications(admin as never);
    expect(adm.find((x) => x.kind === "critical_issue")!.href).toBe(`/admin/issue/${v.issue!.id}`);
  });

  it("a new ordinary issue is an info notification; a reopened one is a warning", async () => {
    const [a, b, c] = [addStudent("A"), addStudent("B"), addStudent("C")];
    const v = await submit(a, "projector kharab hai networking lab mein");
    await submit(b, "networking lab ka projecter nahi chal raha");
    await submit(c, "projector not working in the networking lab");
    expect((await listNotifications(staffBy.CSE as never))[0]).toMatchObject({ kind: "new_issue", severity: "info" });
    await changeStatus(staffBy.CSE as never, v.issue!.id, "in_progress", null);
    await changeStatus(staffBy.CSE as never, v.issue!.id, "resolved", "ok");
    const { castVote } = await import("@/lib/services/voteService");
    await castVote(a as never, v.issue!.id, "dispute");
    await castVote(b as never, v.issue!.id, "dispute");
    expect((await listNotifications(staffBy.CSE as never))[0]).toMatchObject({ kind: "reopened", severity: "warn" });
  });

  it("stuck reports show up for the admin only", async () => {
    db.failNext.attachNew = 5;
    await submit(addStudent("S"), "projector kharab hai networking lab mein");
    expect((await listNotifications(admin as never)).some((x) => x.kind === "attention")).toBe(true);
    expect((await listNotifications(staffBy.CSE as never)).some((x) => x.kind === "attention")).toBe(false);
  });
});

describe("confidentiality sweep: every role, every notification", () => {
  it("a confidential report leaks nothing: no id, text, place or author anywhere; the admin sees a count only", async () => {
    const zain = addStudent("Zain Raza");
    const other = addStudent("Other");
    await submit(zain, "Seniors are ragging first year students behind the cafeteria RAGGINGMARKER");
    await submit(other, "projector kharab hai networking lab mein");
    const issue = [...db.issues.values()].find((i) => i.isConfidential)!;

    const all: Record<string, unknown> = { zain: await listNotifications(zain as never), other: await listNotifications(other as never), admin: await listNotifications(admin as never) };
    for (const d of DEPARTMENTS) all[`staff:${d}`] = await listNotifications(staffBy[d] as never);

    for (const [who, payload] of Object.entries(all)) {
      const s = json(payload);
      expect(s, who).not.toContain("RAGGINGMARKER");
      expect(s, who).not.toContain(issue.id);
      expect(s, who).not.toContain(zain.id);
      expect(s, who).not.toMatch(/ragging|harass|cafeteria/i);
    }
    const conf = (all.admin as { kind: string; title: string; href: string; body: string }[]).find((x) => x.kind === "confidential_count")!;
    expect(conf).toMatchObject({ title: "1 confidential report waiting", href: "/admin/confidential", body: "Open the confidential queue." });
    for (const who of ["zain", "other"]) expect((all[who] as { kind: string }[]).some((x) => x.kind === "confidential_count")).toBe(false);
  });

  it("no user, no notifications", async () => {
    await expect(listNotifications(null)).rejects.toMatchObject({ code: "unauthorized" });
  });
});
