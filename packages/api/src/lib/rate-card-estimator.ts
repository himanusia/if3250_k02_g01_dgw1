import type { FollowerTier, RateCardMetadata, RateCardRange, RateCardValue } from "@if3250_k02_g01_dgw1/db/schema/kol";

import { getSettingJson } from "./app-settings";

type EstimateRateCardInput = {
  averageLikes: number;
  averageViews: number;
  campaignHistoryCount: number;
  engagementRate: string;
  followerTier: FollowerTier;
  platform?: string;
  platformCount: number;
  totalFollowers: number;
};

type EstimateRateCardResult = {
  estimatedRateCard: RateCardValue;
  metadata: RateCardMetadata;
};

export type RateCardFormulaSettings = {
  campaignHistoryBonus: number;
  engagementRateIdr: number;
  followerRateIdr: number;
  instagramMultiplier: number;
  macroTierMultiplier: number;
  maxCampaignHistoryBonus: number;
  maxMultiPlatformBonus: number;
  megaTierMultiplier: number;
  microTierMultiplier: number;
  minimumRateIdr: number;
  multiPlatformBonus: number;
  nanoTierMultiplier: number;
  rangeSpread: number;
  reelMultiplier: number;
  storyMultiplier: number;
  tiktokMultiplier: number;
  viewCpmIdr: number;
};

const RATE_CARD_FORMULA_SETTINGS_KEY = "rate_card_formula_settings";
const FORMULA_VERSION = "deterministic-formula-v1";

export const DEFAULT_RATE_CARD_FORMULA_SETTINGS: RateCardFormulaSettings = {
  campaignHistoryBonus: 0.03,
  engagementRateIdr: 700,
  followerRateIdr: 35,
  instagramMultiplier: 1,
  macroTierMultiplier: 1.1,
  maxCampaignHistoryBonus: 0.15,
  maxMultiPlatformBonus: 0.1,
  megaTierMultiplier: 1.25,
  microTierMultiplier: 1,
  minimumRateIdr: 50_000,
  multiPlatformBonus: 0.05,
  nanoTierMultiplier: 0.9,
  rangeSpread: 0.2,
  reelMultiplier: 1.6,
  storyMultiplier: 0.35,
  tiktokMultiplier: 0.85,
  viewCpmIdr: 50_000,
};

function parseEngagementRate(engagementRate: string) {
  const parsed = Number(engagementRate.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToThousand(value: number) {
  return Math.round(value / 1000) * 1000;
}

function buildRange(suggested: number, spread: number): RateCardRange {
  const safeSpread = clamp(spread, 0, 0.9);
  const min = roundToThousand(suggested * (1 - safeSpread));
  const max = roundToThousand(suggested * (1 + safeSpread));
  return { max, min, suggested };
}

function computeConfidenceScore(input: EstimateRateCardInput) {
  let score = 0.4;
  if (input.totalFollowers > 0) score += 0.15;
  if (input.averageLikes > 0) score += 0.1;
  if (input.averageViews > 0) score += 0.1;
  if (parseEngagementRate(input.engagementRate) > 0) score += 0.15;
  if (input.platformCount > 0) score += 0.05;
  if (input.campaignHistoryCount > 0) score += 0.05;
  return Number(clamp(score, 0.4, 0.98).toFixed(2));
}

function getTierMultiplier(tier: FollowerTier, settings: RateCardFormulaSettings) {
  switch (tier) {
    case "nano":
      return settings.nanoTierMultiplier;
    case "micro":
      return settings.microTierMultiplier;
    case "macro":
      return settings.macroTierMultiplier;
    case "mega":
      return settings.megaTierMultiplier;
  }
}

function getPlatformMultiplier(platform: string | undefined, settings: RateCardFormulaSettings) {
  if (platform === "tiktok") return settings.tiktokMultiplier;
  if (platform === "instagram") return settings.instagramMultiplier;
  return 1;
}

export async function getRateCardFormulaSettings() {
  const stored = await getSettingJson<Partial<RateCardFormulaSettings>>(
    RATE_CARD_FORMULA_SETTINGS_KEY,
    DEFAULT_RATE_CARD_FORMULA_SETTINGS,
  );

  return {
    ...DEFAULT_RATE_CARD_FORMULA_SETTINGS,
    ...stored,
  };
}

export function calculateRateCardWithSettings(
  input: EstimateRateCardInput,
  settings: RateCardFormulaSettings,
): EstimateRateCardResult {
  const engagementRate = parseEngagementRate(input.engagementRate);
  const expectedEngagements = input.totalFollowers * (engagementRate / 100);
  const followerValue = input.totalFollowers * settings.followerRateIdr;
  const engagementValue = expectedEngagements * settings.engagementRateIdr;
  const viewValue = (Math.max(0, input.averageViews) / 1000) * settings.viewCpmIdr;
  const baseValue = followerValue + engagementValue + viewValue;
  const campaignBonus = Math.min(
    Math.max(0, input.campaignHistoryCount) * settings.campaignHistoryBonus,
    settings.maxCampaignHistoryBonus,
  );
  const platformBonus = Math.min(
    Math.max(0, input.platformCount - 1) * settings.multiPlatformBonus,
    settings.maxMultiPlatformBonus,
  );
  const postSuggested = roundToThousand(
    Math.max(
      settings.minimumRateIdr,
      baseValue
        * getTierMultiplier(input.followerTier, settings)
        * getPlatformMultiplier(input.platform, settings)
        * (1 + campaignBonus + platformBonus),
    ),
  );

  const storySuggested = roundToThousand(postSuggested * settings.storyMultiplier);
  const reelSuggested = roundToThousand(postSuggested * settings.reelMultiplier);

  return {
    estimatedRateCard: {
      currency: "IDR",
      post: buildRange(postSuggested, settings.rangeSpread),
      reel: buildRange(reelSuggested, settings.rangeSpread),
      story: buildRange(storySuggested, settings.rangeSpread),
    },
    metadata: {
      confidence: computeConfidenceScore(input),
      lastComputedAt: new Date().toISOString(),
      modelVersion: FORMULA_VERSION,
      source: "formula",
    },
  };
}

export async function estimateRateCard(input: EstimateRateCardInput): Promise<EstimateRateCardResult> {
  return calculateRateCardWithSettings(input, await getRateCardFormulaSettings());
}
