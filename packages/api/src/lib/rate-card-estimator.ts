import type { FollowerTier, RateCardMetadata, RateCardRange, RateCardValue } from "@if3250_k02_g01_dgw1/db/schema/kol";

import { predictRateCardIdr } from "./onnx-model";

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

const ML_VERSION = "lightgbm-huber-v1";

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

export async function estimateRateCard(input: EstimateRateCardInput): Promise<EstimateRateCardResult> {
  const postSuggested = roundToThousand(
    clamp(await predictRateCardIdr(input.totalFollowers, input.platform ?? "other"), 50_000, 500_000_000),
  );

  // The training dataset has one rate card per KOL — treated as the post rate.
  // Story and reel are derived from market-convention ratios since no per-format labels exist in the training data.
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
      modelVersion: ML_VERSION,
      source: "ml",
    },
  };
}
