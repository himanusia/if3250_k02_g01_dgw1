import { describe, expect, test } from "bun:test";

import { getBrandSummaries } from "./brand-summary.ts";

const baseCampaign = {
  brand: "Digi Wonder",
  budgetIdr: 0,
  createdAt: "2026-05-01T00:00:00.000Z",
  description: "Campaign",
  id: 1,
  keywords: "",
  selectedKolIds: [],
  kols: [],
  name: "Launch",
  objective: "Awareness",
  periodEnd: "2026-05-31",
  periodStart: "2026-05-01",
  postBriefs: "",
  status: "active",
  targetContentCount: 0,
  targetFollowerTier: "",
  targetKolCount: 0,
  updatedAt: "2026-05-10T00:00:00.000Z",
};

describe("brand summary", () => {
  test("summarizes campaign list records without treating KOL as brand-owned data", () => {
    const summaries = getBrandSummaries([
      {
        ...baseCampaign,
        kols: [
          { displayName: "A", handles: ["instagram:a", "tiktok:a"], id: 10 },
          { displayName: "B", handles: ["instagram:b"], id: 11 },
        ],
      },
    ]);

    expect(summaries).toEqual([
      expect.objectContaining({
        activeCampaigns: 1,
        campaigns: [expect.objectContaining({ name: "Launch" })],
        name: "Digi Wonder",
      }),
    ]);
    expect("totalKols" in summaries[0]).toBe(false);
    expect("platforms" in summaries[0]).toBe(false);
  });

  test("does not throw when campaign kols is missing in stale API payloads", () => {
    const campaignWithoutRelations = { ...baseCampaign };
    delete campaignWithoutRelations.kols;

    expect(() => getBrandSummaries([campaignWithoutRelations])).not.toThrow();
    expect(getBrandSummaries([campaignWithoutRelations])[0].campaigns).toHaveLength(1);
  });
});
