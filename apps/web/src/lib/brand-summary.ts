import type { CampaignRecord } from "./app-types";

export type BrandSummary = {
  name: string;
  campaigns: CampaignRecord[];
  activeCampaigns: number;
  latestUpdatedAt: string;
};

export function getBrandSummaries(campaigns: CampaignRecord[]): BrandSummary[] {
  const grouped = new Map<string, CampaignRecord[]>();

  for (const campaign of campaigns) {
    const name = campaign.brand.trim() || "Tanpa brand";
    grouped.set(name, [...(grouped.get(name) ?? []), campaign]);
  }

  return [...grouped.entries()]
    .map(([name, brandCampaigns]) => ({
      name,
      campaigns: brandCampaigns,
      activeCampaigns: brandCampaigns.filter((campaign) => campaign.status === "active").length,
      latestUpdatedAt: brandCampaigns
        .map((campaign) => campaign.updatedAt)
        .sort((a, b) => b.localeCompare(a))[0],
    }))
    .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
}
