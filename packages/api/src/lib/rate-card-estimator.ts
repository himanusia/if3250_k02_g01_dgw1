import type { FollowerTier, RateCardMetadata, RateCardRange, RateCardValue } from "@if3250_k02_g01_dgw1/db/schema/kol";

type EstimateRateCardInput = {
  averageLikes: number;
  averageViews: number;
  campaignHistoryCount: number;
  engagementRate: string;
  followerTier: FollowerTier;
  platformCount: number;
  totalFollowers: number;
};

type EstimateRateCardResult = {
  estimatedRateCard: RateCardValue;
  metadata: RateCardMetadata;
};

const RATE_CARD_MODEL_VERSION = "formula-v1";

function toPositiveInt(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

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

function buildRange(suggested: number): RateCardRange {
  const min = roundToThousand(suggested * 0.8);
  const max = roundToThousand(suggested * 1.2);

  return {
    max,
    min,
    suggested,
  };
}

function estimatePostSuggestedRate(input: EstimateRateCardInput) {
  const followers = toPositiveInt(input.totalFollowers);
  const averageLikes = toPositiveInt(input.averageLikes);
  const averageViews = toPositiveInt(input.averageViews);
  const engagement = parseEngagementRate(input.engagementRate);

  const tierMultiplier: Record<FollowerTier, number> = {
    nano: 1,
    micro: 1.12,
    macro: 1.28,
    mega: 1.5,
  };

  const baseRate =
    150_000 +
    followers * 8 +
    averageLikes * 1.2 +
    averageViews * 0.5 +
    engagement * 12_000;

  const platformMultiplier = 1 + Math.max(0, input.platformCount - 1) * 0.08;
  const campaignMultiplier = 1 + Math.min(10, Math.max(0, input.campaignHistoryCount)) * 0.01;

  const suggested = roundToThousand(
    clamp(baseRate * tierMultiplier[input.followerTier] * platformMultiplier * campaignMultiplier, 50_000, 500_000_000),
  );

  return suggested;
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

export function estimateRateCard(input: EstimateRateCardInput): EstimateRateCardResult {
  const postSuggested = estimatePostSuggestedRate(input);
  const storySuggested = roundToThousand(postSuggested * 0.35);
  const reelSuggested = roundToThousand(postSuggested * 1.6);

  return {
    estimatedRateCard: {
      currency: "IDR",
      post: buildRange(postSuggested),
      reel: buildRange(reelSuggested),
      story: buildRange(storySuggested),
    },
    metadata: {
      confidence: computeConfidenceScore(input),
      lastComputedAt: new Date().toISOString(),
      modelVersion: RATE_CARD_MODEL_VERSION,
      source: "formula",
    },
  };
}
