import type { CampaignDashboardRecord } from "@/lib/app-types";

import { getProgressPercent, getTargetInteractions, parseCampaignObjective } from "./campaign-objective";

export type CampaignProgressSummary = CampaignDashboardRecord & {
  actualInteractions: number;
  daysLeft: number | null;
  periodProgressPercent: number;
  targetInteractions: number;
  viewProgressPercent: number;
  interactionProgressPercent: number;
  syncHealth: "fresh" | "stale" | "never";
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getCampaignProgressSummary(campaign: CampaignDashboardRecord, now = new Date()): CampaignProgressSummary {
  const objective = parseCampaignObjective(campaign.objective);
  const actualInteractions = campaign.likeCount + campaign.commentCount + campaign.shareCount;
  const targetInteractions = getTargetInteractions(objective);
  const periodStart = parseDate(campaign.periodStart);
  const periodEnd = parseDate(campaign.periodEnd);
  const lastSyncedAt = parseDate(campaign.lastSyncedAt);
  const daysLeft = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_IN_MS)) : null;
  const periodDuration = periodStart && periodEnd ? periodEnd.getTime() - periodStart.getTime() : 0;
  const elapsed = periodStart ? now.getTime() - periodStart.getTime() : 0;
  const periodProgressPercent = periodDuration > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / periodDuration) * 100))) : 0;
  const syncAgeMs = lastSyncedAt ? now.getTime() - lastSyncedAt.getTime() : Number.POSITIVE_INFINITY;

  return {
    ...campaign,
    actualInteractions,
    daysLeft,
    interactionProgressPercent: getProgressPercent(actualInteractions, targetInteractions),
    periodProgressPercent,
    syncHealth: lastSyncedAt ? (syncAgeMs <= DAY_IN_MS ? "fresh" : "stale") : "never",
    targetInteractions,
    viewProgressPercent: getProgressPercent(campaign.viewCount, objective.targetViews),
  };
}

export function sortCampaignsByManagementPriority(campaigns: CampaignDashboardRecord[], now = new Date()) {
  return campaigns
    .map((campaign) => getCampaignProgressSummary(campaign, now))
    .sort((left, right) => {
      const statusWeight = (status: CampaignDashboardRecord["status"]) => {
        if (status === "active") return 0;
        if (status === "draft") return 1;
        if (status === "completed") return 2;
        return 3;
      };

      const statusDiff = statusWeight(left.status) - statusWeight(right.status);
      if (statusDiff !== 0) return statusDiff;

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}
