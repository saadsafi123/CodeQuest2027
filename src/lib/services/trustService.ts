// Purpose: the trust explainer. A student's score is ALWAYS 50 + the sum of their ledger events (clamped 0..100);
// this returns every event with its plain-language reason, the running total, the current weight and why.
import "server-only";
import { config } from "@/lib/config";
import { trustRepository, userRepository, type User } from "@/lib/db/repositories";
import { canViewTrust, isAdmin } from "@/lib/rules/permissions";
import { clampTrust, explainWeight, trustWeight } from "@/lib/rules/trust";
import { ServiceError } from "./errors";

export interface TrustBreakdown {
  userId: string;
  name: string;
  startScore: number;
  currentScore: number;
  events: { id: string; at: string; delta: number; reason: string; runningTotal: number }[];
  /** 50 + sum of deltas, clamped: must equal currentScore. */
  rebuiltScore: number;
  consistent: boolean;
  weight: { value: number; lines: string[] };
  /** What counts toward trust, from config (so the page never disagrees with the code). */
  rules: string[];
}

export async function getTrustBreakdown(viewer: User | null, targetUserId: string): Promise<TrustBreakdown> {
  if (!viewer) throw new ServiceError("unauthorized", "Select a user first.");
  // same "not found" for no access and for unknown users
  if (!canViewTrust(viewer, targetUserId)) throw new ServiceError("not_found", "Student not found.");
  const [target, events] = await Promise.all([userRepository.getById(targetUserId), trustRepository.listEvents(targetUserId)]);
  if (!target || target.role !== "student") throw new ServiceError("not_found", "Student not found.");

  let total: number = config.trust.base;
  const rows = events.map((e) => {
    total += e.delta;
    return { id: e.id, at: e.createdAt, delta: e.delta, reason: e.reason, runningTotal: Math.round(total * 100) / 100 };
  });
  const rebuilt = Math.round(clampTrust(config.trust.base + events.reduce((a, e) => a + e.delta, 0)) * 100) / 100;
  const d = config.trust.deltas;
  const w = explainWeight({ trustScore: target.trustScore, createdAt: target.createdAt, ledgerEvents: events.length });
  return {
    userId: target.id,
    name: target.name,
    startScore: config.trust.base,
    currentScore: Math.round(target.trustScore * 100) / 100,
    events: rows,
    rebuiltScore: rebuilt,
    consistent: Math.abs(rebuilt - target.trustScore) < 0.01,
    weight: { value: w.weight, lines: w.lines },
    rules: [
      `Everyone starts at ${config.trust.base}. The score stays between ${config.trust.min} and ${config.trust.max}.`,
      `+${d.reportConfirmedOrValidated} when staff take up your report (it was validated).`,
      `+${d.voteMatchesFinalOutcome} when your confirm/dispute vote matches the final outcome.`,
      `${d.reportFlaggedSpamOrFake} when staff or the admin flag a report of yours as spam or fake.`,
      `${d.abuse} when a report is flagged as abuse of the system.`,
    ],
  };
}

/** The signed-in user's trust score, straight from the ledger. The top bar and the dashboard tile read this, never a cache. */
export async function getMyTrust(user: User | null): Promise<{ userId: string; score: number }> {
  if (!user) throw new ServiceError("unauthorized", "Select a user first.");
  const score = await userRepository.ledgerScore(user.id);
  if (score === null) throw new ServiceError("not_found", "User not found.");
  return { userId: user.id, score: Math.round(score * 100) / 100 };
}

export interface TrustListRow {
  userId: string;
  name: string;
  score: number;
  weight: number;
  capped: boolean;
  events: number;
}

/** Admin: every student with score, current weight and ledger size. */
export async function listStudentTrust(viewer: User | null): Promise<TrustListRow[]> {
  if (!isAdmin(viewer)) throw new ServiceError("forbidden", "Only the admin can see this.");
  const students = (await userRepository.list()).filter((u) => u.role === "student");
  const profiles = await userRepository.trustProfiles(students.map((s) => s.id));
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  return students
    .map((s) => {
      const p = byId.get(s.id);
      const w = trustWeight({ trustScore: s.trustScore, createdAt: s.createdAt, ledgerEvents: p?.ledgerEvents ?? 0 });
      return { userId: s.id, name: s.name, score: s.trustScore, weight: w.weight, capped: w.capped, events: p?.ledgerEvents ?? 0 };
    })
    .sort((a, b) => b.score - a.score);
}
