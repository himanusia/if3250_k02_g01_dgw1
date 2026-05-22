import { describe, expect, test } from "bun:test";

import {
  encodeCampaignObjective,
  formatObjectiveSummary,
  getProgressPercent,
  getTargetInteractions,
  parseCampaignObjective,
} from "./campaign-objective.ts";

describe("campaign objective", () => {
  test("stores explicit view and interaction targets instead of arbitrary text", () => {
    const encoded = encodeCampaignObjective({
      legacyText: "Launch awareness",
      targetComments: 300,
      targetLikes: 2_000,
      targetShares: 700,
      targetViews: 50_000,
    });

    const parsed = parseCampaignObjective(encoded);

    expect(parsed).toEqual({
      legacyText: "Launch awareness",
      targetComments: 300,
      targetLikes: 2000,
      targetShares: 700,
      targetViews: 50000,
    });
    expect(getTargetInteractions(parsed)).toBe(3000);
    expect(formatObjectiveSummary(encoded)).toBe("50.000 views • 3.000 interaksi");
  });

  test("keeps legacy objective text readable without inventing numeric targets", () => {
    const parsed = parseCampaignObjective("Awareness dan sales");

    expect(parsed.targetViews).toBe(0);
    expect(getTargetInteractions(parsed)).toBe(0);
    expect(parsed.legacyText).toBe("Awareness dan sales");
    expect(formatObjectiveSummary("Awareness dan sales")).toBe("Awareness dan sales");
  });

  test("caps progress percentage at 100 and handles empty targets", () => {
    expect(getProgressPercent(125, 100)).toBe(100);
    expect(getProgressPercent(25, 100)).toBe(25);
    expect(getProgressPercent(25, 0)).toBe(0);
  });
});
