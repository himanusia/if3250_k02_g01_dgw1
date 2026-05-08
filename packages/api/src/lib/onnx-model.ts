import { fileURLToPath } from "node:url";

import * as ort from "onnxruntime-node";

const MODEL_PATH = fileURLToPath(
  new URL("../../../../packages/ml/artifacts/rate-card-model.onnx", import.meta.url),
);

const PLATFORM_FEATURES = ["instagram", "tiktok", "other"] as const;
const CREATOR_TYPE_FEATURES = ["cat", "dog_small_breed", "dog_medium_breed", "dog_large_breed", "other"] as const;
const FOLLOWER_TIER_FEATURES = ["nano", "micro", "macro", "mega"] as const;

type Platform = (typeof PLATFORM_FEATURES)[number];
type CreatorType = (typeof CREATOR_TYPE_FEATURES)[number];

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH).catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

function getFollowerTier(followers: number): (typeof FOLLOWER_TIER_FEATURES)[number] {
  if (followers >= 1_000_000) return "mega";
  if (followers >= 100_000) return "macro";
  if (followers >= 10_000) return "micro";
  return "nano";
}

function buildFeatureVector(followers: number, platform: Platform, creatorType: CreatorType, isBarter = false): Float32Array {
  const tier = getFollowerTier(followers);
  const vec: number[] = [
    followers,
    Math.log1p(followers),
    ...PLATFORM_FEATURES.map((p) => (platform === p ? 1 : 0)),
    ...CREATOR_TYPE_FEATURES.map((c) => (creatorType === c ? 1 : 0)),
    ...FOLLOWER_TIER_FEATURES.map((t) => (tier === t ? 1 : 0)),
    isBarter ? 1 : 0,
  ];
  return new Float32Array(vec);
}

export async function predictRateCardIdr(followers: number, platform: string): Promise<number> {
  const session = await getSession();

  const normPlatform: Platform = (PLATFORM_FEATURES as readonly string[]).includes(platform)
    ? (platform as Platform)
    : "other";

  const features = buildFeatureVector(followers, normPlatform, "other", false);
  const tensor = new ort.Tensor("float32", features, [1, features.length]);

  const result = await session.run({ features: tensor });
  const raw = (result["variable"]?.data as Float32Array)[0] ?? 0;

  return Math.max(0, Math.expm1(raw));
}
