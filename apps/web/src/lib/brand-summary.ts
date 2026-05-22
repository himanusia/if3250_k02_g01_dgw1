import type { CampaignRecord } from "./app-types";

export type BrandSummary = {
  name: string;
  campaigns: CampaignRecord[];
  activeCampaigns: number;
  totalKols: number;
  platforms: string[];
  latestUpdatedAt: string;
};

export function getBrandSummaries(campaigns: CampaignRecord[]): BrandSummary[] {
  const grouped = new Map<string, CampaignRecord[]>();

  for (const campaign of campaigns) {
    const name = campaign.brand.trim() || "Tanpa brand";
    grouped.set(name, [...(grouped.get(name) ?? []), campaign]);
  }

  return [...grouped.entries()]
    .map(([name, brandCampaigns]) => {
      const platforms = new Set<string>();
      let totalKols = 0;

      for (const campaign of brandCampaigns) {
        const kols = Array.isArray(campaign.kols) ? campaign.kols : [];
        totalKols += kols.length;

        for (const kol of kols) {
          for (const handle of kol.handles ?? []) {
            const [platform] = handle.split(":", 1);
            if (platform) {
              platforms.add(platform);
            }
          }
        }
      }

      return {
        name,
        campaigns: brandCampaigns,
        activeCampaigns: brandCampaigns.filter((campaign) => campaign.status === "active").length,
        totalKols,
        platforms: [...platforms].sort(),
        latestUpdatedAt: brandCampaigns
          .map((campaign) => campaign.updatedAt)
          .sort((a, b) => b.localeCompare(a))[0],
      };
    })
    .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
}

export function countUniquePlatforms(brandSummaries: BrandSummary[]) {
  return new Set(brandSummaries.flatMap((brand) => brand.platforms)).size;
}
