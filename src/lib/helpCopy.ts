// Purpose: THE one place for plain-language explanations of ReportFix jargon (shown by <InfoTip term="...">, the /help page
// and the design gallery). Numbers come from config.ts so the words can never disagree with the rules.
// Pure data, no server-only import: usable from client components.
import { config } from "./config";

export interface HelpEntry {
  title: string;
  /** One or two plain sentences, shown in the tooltip. */
  short: string;
  /** Optional extra lines for the help page. */
  more?: string[];
}

const v = config.voting;
const t = config.trust;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export const HELP = {
  priority: {
    title: "Priority",
    short: "How urgent an issue is: low, medium, high or critical. It depends on the kind of problem, whether anyone is in danger, and how many students are affected. Never on tone, capital letters or the word \"urgent\".",
    more: [
      "Danger (fire, sparks, gas, medical, collapse) is always critical, even when written calmly.",
      "Network, electrical, equipment and plumbing problems start at medium; AC, furniture, cleanliness and food start at low.",
      "More affected students can raise it one or two steps. One student alone can never lift an ordinary issue above medium.",
    ],
  },
  hazard: {
    title: "Safety hazard",
    short: "Fire, sparks, smoke, gas, electric shock, a medical emergency or structural danger. These are always critical, however calmly they are described.",
  },
  meToo: {
    title: "Me too",
    short: "When students report the same problem at the same place it becomes ONE issue, and every extra student adds to its \"me too\" count. A bigger count means more people are affected.",
  },
  affected: {
    title: "Students affected",
    short: "Everyone who reported this issue or joined it with \"me too\". Only they can vote on whether the fix really worked.",
  },
  trust: {
    title: "Trust score",
    short: `Starts at ${t.base}. It goes up when staff confirm your reports and when your votes match the outcome, and down when a report is flagged as spam or fake. Every change is listed with its reason.`,
    more: [
      `+${t.deltas.reportConfirmedOrValidated} when staff take up your report (validated).`,
      `+${t.deltas.voteMatchesFinalOutcome} when your confirm or dispute vote matches the final outcome.`,
      `${t.deltas.reportFlaggedSpamOrFake} for a report flagged as spam or fake, ${t.deltas.abuse} for abuse.`,
    ],
  },
  weight: {
    title: "Vote weight",
    short: `How much your report and your vote count: ${t.weightOffset} + trust / ${t.weightTrustDivisor}. Accounts under ${t.newAccountMaxAgeHours} hours old, or with fewer than ${t.newAccountMinLedgerEvents} trust events, count at most ${t.newAccountWeightCap}.`,
  },
  confidential: {
    title: "Confidential",
    short: "Harassment and ragging reports are handled by the admin only. They never appear on any board, are never sent to a department, and the reporter's identity is never shown to anyone, not even the admin.",
  },
  place: {
    title: "Why we ask where",
    short: "The place decides which department gets the issue. If the place is missing or unclear we ask before anything is saved, so a report is never sent to the wrong people by a guess.",
  },
  votingWindow: {
    title: "Voting window",
    short: `After staff mark an issue resolved, the affected students have ${v.windowHours} hours to confirm or dispute. If nobody reopens it, it closes by itself when the time is up.`,
  },
  reopen: {
    title: "Reopening",
    short: `An issue reopens when at least ${v.minDistinctDisputers} affected students dispute the fix, their votes are ${pct(v.disputeWeightShareToReopen)} or more of the weighted votes, and together they weigh at least ${v.minDisputeWeightToReopen}. Two brand-new accounts alone cannot reopen it.`,
  },
  earlyClose: {
    title: "Early close",
    short: `It closes early once at least ${v.minDistinctConfirmers} students confirm and their weight is more than ${pct(v.earlyCloseConfirmShare)} of everyone affected.`,
  },
  pool: {
    title: "Who can vote",
    short: "Students who were affected when the fix was reported. Someone who joins later still joins the issue, but their vote is not counted in that round.",
  },
  crowd: {
    title: "Crowd score",
    short: `Each affected student adds to the score, but one person counts at most ${config.crowd.perPersonWeightCap} and every extra person counts a little less. About 4 established students raise an issue one step, about 9 raise it two.`,
  },
  department: {
    title: "Department",
    short: "The department that owns the place (for example the Networking Lab belongs to Computer Software Engineering). Every lab belongs to its parent department.",
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpTerm = keyof typeof HELP;
