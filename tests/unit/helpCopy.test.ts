// The plain-words help copy must agree with the rules (numbers come from config) and be complete.
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { HELP, type HelpTerm } from "@/lib/helpCopy";

describe("helpCopy", () => {
  it("every entry has a title and a plain short explanation", () => {
    for (const [k, e] of Object.entries(HELP)) {
      expect(e.title.length, k).toBeGreaterThan(2);
      expect(e.short.length, k).toBeGreaterThan(40);
      expect(e.short, k).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it("covers the jargon the UI uses", () => {
    const need: HelpTerm[] = ["priority", "hazard", "meToo", "affected", "trust", "weight", "confidential", "place", "votingWindow", "reopen", "earlyClose", "pool", "crowd", "department"];
    for (const t of need) expect(HELP[t], t).toBeDefined();
  });

  it("quotes the real numbers from config", () => {
    expect(HELP.trust.short).toContain(`Starts at ${config.trust.base}`);
    expect(HELP.weight.short).toContain(String(config.trust.newAccountWeightCap));
    expect(HELP.votingWindow.short).toContain(String(config.voting.windowHours));
    expect(HELP.reopen.short).toContain(String(config.voting.minDisputeWeightToReopen));
    expect(HELP.earlyClose.short).toContain(`${Math.round(config.voting.earlyCloseConfirmShare * 100)}%`);
  });

  it("never promises more than the code does about confidential reports", () => {
    expect(HELP.confidential.short).toMatch(/admin only/);
    expect(HELP.confidential.short).toMatch(/not even the admin/);
  });
});
