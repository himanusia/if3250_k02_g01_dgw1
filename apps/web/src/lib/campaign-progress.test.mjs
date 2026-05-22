import { describe, expect, test } from "bun:test";

import { encodeCampaignObjective } from "./campaign-objective.ts";
import { getCampaignProgressSummary, sortCampaignsByManagementPriority } from "./campaign-progress.ts";

const baseCampaign = {
  brand: "Digi Wonder",
  commentCount: 0,
  contentCount: 0,
  createdAt: "2026-05-01T00:00:00.000Z",
  failedSyncCount: 0,
  id: 1,
  kolCount: 0,
  lastScrapedAt: null,
  lastSyncedAt: null,
  likeCount: 0,
  name: "Campaign",
  objective: encodeCampaignObjective({
    legacyText: "",
    targetComments: 100,
    targetLikes: 700,
    targetShares: 200,
    targetViews: 10_000,
  }),
  pendingSyncCount: 0,
  periodEnd: "2026-05-31",
  periodStart: "2026-05-01",
  shareCount: 0,
  status: "active",
  syncedContentCount: 0,
  updatedAt: "2026-05-10T00:00:00.000Z",
  viewCount: 0,
};

describe("campaign progress", () => {
  test("computes objective progress from explicit views and interactions", () => {
    const summary = getCampaignProgressSummary(
      {
        ...baseCampaign,
        commentCount: 50,
        likeCount: 300,
        shareCount: 150,
        viewCount: 2_500,
      },
      new Date("2026-05-16T00:00:00.000Z"),
    );

    expect(summary.actualInteractions).toBe(500);
    expect(summary.targetInteractions).toBe(1000);
    expect(summary.viewProgressPercent).toBe(25);
    expect(summary.interactionProgressPercent).toBe(50);
    expect(summary.periodProgressPercent).toBe(50);
  });

  test("prioritizes active campaigns before draft and completed campaigns", () => {
    const sorted = sortCampaignsByManagementPriority([
      { ...baseCampaign, id: 2, status: "completed", updatedAt: "2026-05-22T00:00:00.000Z" },
      { ...baseCampaign, id: 3, status: "draft", updatedAt: "2026-05-20T00:00:00.000Z" },
      { ...baseCampaign, id: 4, status: "active", updatedAt: "2026-05-18T00:00:00.000Z" },
    ]);

    expect(sorted.map((campaign) => campaign.id)).toEqual([4, 3, 2]);
  });
});
