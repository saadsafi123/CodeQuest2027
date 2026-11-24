// Purpose: notifications DERIVED from existing data (no notifications table). Every item is built from reads that already
// apply the viewer's permissions (listMyIssues / listQueue / adminOverview / the trust ledger), so a notification can never
// show more than the viewer could open anyway.
//   - Students and staff never get anything about a confidential report.
//   - The admin gets a COUNT-ONLY item for the confidential queue: no text, no place, no author, no issue id.
// "Unread" is a per-browser cursor kept by the client; nothing is written anywhere.
import "server-only";
import { trustRepository, type User } from "@/lib/db/repositories";
import { ServiceError } from "./errors";
import { adminOverview, listMyIssues, listQueue, listConfidentialQueue, type IssueSummary } from "./issueService";

export type NoticeSeverity = "info" | "success" | "warn" | "critical";

export interface Notice {
  id: string;
  kind: "vote_needed" | "reopened" | "work_started" | "resolved" | "closed" | "trust" | "critical_issue" | "new_issue" | "attention" | "confidential_count" | "awaiting_place";
  severity: NoticeSeverity;
  title: string;
  body: string;
  href: string | null;
  /** ISO time the underlying event happened (the client compares it with its read cursor). */
  at: string;
}

const WINDOW_MS = 72 * 3_600_000;
const MAX = 30;
const fresh = (iso: string, now: number) => now - new Date(iso).getTime() <= WINDOW_MS;
const place = (i: IssueSummary) => i.location?.name ?? "campus";

function forStudent(issues: IssueSummary[], now: number): Notice[] {
  const out: Notice[] = [];
  for (const i of issues) {
    if (i.confidential) continue; // never about a confidential report
    const href = `/student/issue/${i.id}`;
    if (i.needsMyVote) out.push({ id: `vote:${i.id}`, kind: "vote_needed", severity: "warn", title: "Your vote is needed", body: `${i.title} at ${place(i)} was marked resolved. Is it really fixed?`, href, at: i.updatedAt });
    else if (!fresh(i.updatedAt, now)) continue;
    else if (i.status === "reopened") out.push({ id: `reopen:${i.id}:${i.updatedAt}`, kind: "reopened", severity: "warn", title: "Issue reopened", body: `${i.title} at ${place(i)} went back to the department.`, href, at: i.updatedAt });
    else if (i.status === "in_progress") out.push({ id: `work:${i.id}:${i.updatedAt}`, kind: "work_started", severity: "info", title: "Work started", body: `${i.title} at ${place(i)} is being worked on.`, href, at: i.updatedAt });
    else if (i.status === "resolved") out.push({ id: `resolved:${i.id}:${i.updatedAt}`, kind: "resolved", severity: "success", title: "Marked resolved", body: `${i.title} at ${place(i)}. Thanks for confirming.`, href, at: i.updatedAt });
    else if (i.status === "closed") out.push({ id: `closed:${i.id}:${i.updatedAt}`, kind: "closed", severity: "success", title: "Issue closed", body: `${i.title} at ${place(i)} is closed.`, href, at: i.updatedAt });
  }
  return out;
}

function forDepartment(issues: IssueSummary[], base: string, now: number): Notice[] {
  const out: Notice[] = [];
  for (const i of issues) {
    if (i.confidential) continue;
    const href = `${base}/${i.id}`;
    const active = i.status === "open" || i.status === "reopened" || i.status === "in_progress";
    if (i.priority === "critical" && active && fresh(i.createdAt, now)) {
      out.push({ id: `crit:${i.id}`, kind: "critical_issue", severity: "critical", title: "Critical issue", body: `${i.title} at ${place(i)}. ${i.meToo} ${i.meToo === 1 ? "student" : "students"} affected.`, href, at: i.createdAt });
    } else if (i.status === "reopened" && fresh(i.updatedAt, now)) {
      out.push({ id: `reopen:${i.id}:${i.updatedAt}`, kind: "reopened", severity: "warn", title: "Issue reopened", body: `Students disputed the fix for ${i.title} at ${place(i)}.`, href, at: i.updatedAt });
    } else if (i.status === "open" && fresh(i.createdAt, now)) {
      out.push({ id: `new:${i.id}`, kind: "new_issue", severity: "info", title: "New issue", body: `${i.title} at ${place(i)}.`, href, at: i.createdAt });
    }
  }
  return out;
}

export async function listNotifications(user: User | null, now: number = Date.now()): Promise<Notice[]> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  let out: Notice[] = [];

  if (user.role === "student") {
    out = forStudent(await listMyIssues(user), now);
    const events = await trustRepository.listEvents(user.id); // already excludes anything tied to a confidential issue
    for (const e of events) {
      if (!fresh(e.createdAt, now)) continue;
      out.push({ id: `trust:${e.id}`, kind: "trust", severity: e.delta >= 0 ? "success" : "warn", title: `Trust ${e.delta >= 0 ? "+" : ""}${e.delta}`, body: e.reason, href: "/student/trust", at: e.createdAt });
    }
  } else if (user.role === "staff") {
    out = forDepartment(await listQueue(user), "/staff/issue", now);
  } else {
    const o = await adminOverview(user);
    out = forDepartment(o.issues, "/admin/issue", now);
    if (o.stats.needsAttention > 0) {
      const latest = o.needsAttention.map((n) => n.createdAt).sort().at(-1) ?? new Date(now).toISOString();
      out.push({ id: `attn:${o.stats.needsAttention}:${latest}`, kind: "attention", severity: "warn", title: `${o.stats.needsAttention} ${o.stats.needsAttention === 1 ? "report needs" : "reports need"} attention`, body: "Saved, but not yet routed. Retry them from the overview.", href: "/admin", at: latest });
    }
    // confidential: COUNT ONLY. No text, no place, no author, no issue id.
    const conf = (await listConfidentialQueue(user)).filter((c) => c.status === "open" || c.status === "reopened");
    if (conf.length > 0) {
      const latest = conf.map((c) => c.createdAt).sort().at(-1)!;
      out.push({ id: `conf:${conf.length}:${latest}`, kind: "confidential_count", severity: "warn", title: `${conf.length} confidential ${conf.length === 1 ? "report" : "reports"} waiting`, body: "Open the confidential queue.", href: "/admin/confidential", at: latest });
    }
  }
  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, MAX);
}
