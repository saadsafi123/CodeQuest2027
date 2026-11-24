// Purpose: the ONE map from internal values to words a person reads. Raw enums such as "in_progress" must never reach the
// screen: UI code calls these functions. Pure, no server-only import (used by client components too).

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  reopened: "Reopened",
  closed: "Closed",
  needs_clarification: "Needs clarification",
  confidential: "Confidential",
};

export const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  staff: "Department staff",
  admin: "Administrator",
};

/** "in_progress" -> "In progress" (fallback for any value that has no explicit label). */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? humanize(s);
export const priorityLabel = (p: string) => PRIORITY_LABEL[p] ?? humanize(p);
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? humanize(r);

/** Tailwind class sets per priority / status. Complete strings so Tailwind can see them; colours come from globals.css tokens. */
export const PRIORITY_CLASS: Record<string, string> = {
  critical: "bg-priority-critical-bg text-priority-critical-fg border-priority-critical-border",
  high: "bg-priority-high-bg text-priority-high-fg border-priority-high-border",
  medium: "bg-priority-medium-bg text-priority-medium-fg border-priority-medium-border",
  low: "bg-priority-low-bg text-priority-low-fg border-priority-low-border",
};

export const STATUS_CLASS: Record<string, string> = {
  open: "bg-status-open-bg text-status-open-fg border-status-open-border",
  in_progress: "bg-status-progress-bg text-status-progress-fg border-status-progress-border",
  resolved: "bg-status-resolved-bg text-status-resolved-fg border-status-resolved-border",
  confirmed: "bg-status-confirmed-bg text-status-confirmed-fg border-status-confirmed-border",
  reopened: "bg-status-reopened-bg text-status-reopened-fg border-status-reopened-border",
  needs_clarification: "bg-status-clarify-bg text-status-clarify-fg border-status-clarify-border",
  closed: "bg-status-closed-bg text-status-closed-fg border-status-closed-border",
  confidential: "bg-status-closed-bg text-status-closed-fg border-status-closed-border",
};
