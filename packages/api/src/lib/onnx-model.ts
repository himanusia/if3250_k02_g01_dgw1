import { fileURLToPath } from "node:url";

import type * as ort from "onnxruntime-node";

const MODEL_PATH = fileURLToPath(
  new URL("../../../../packages/ml/artifacts/rate-card-model.onnx", import.meta.url),
);

const PLATFORM_FEATURES = ["instagram", "tiktok", "other"] as const;
const CREATOR_TYPE_FEATURES = ["cat", "dog_small_breed", "dog_medium_breed", "dog_large_breed", "other"] as const;
const FOLLOWER_TIER_FEATURES = ["nano", "micro", "macro", "mega"] as const;

type Platform = (typeof PLATFORM_FEATURES)[number];
type CreatorType = (typeof CREATOR_TYPE_FEATURES)[number];

let ortRuntimePromise: Promise<typeof import("onnxruntime-node")> | null = null;
let sessionPromise: Promise<ort.InferenceSession> | null = null;

function loadOrtRuntime(): Promise<typeof import("onnxruntime-node")> {
  if (!ortRuntimePromise) {
    ortRuntimePromise = import("onnxruntime-node");
  }
  return ortRuntimePromise;
}

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = loadOrtRuntime()
      .then((ortRuntime) => ortRuntime.InferenceSession.create(MODEL_PATH))
      .catch((err) => {
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
  const logF = Math.log1p(followers);
  const vec: number[] = [
    followers,
    logF,
    logF ** 2,
    ...PLATFORM_FEATURES.map((p) => (platform === p ? 1 : 0)),
    ...CREATOR_TYPE_FEATURES.map((c) => (creatorType === c ? 1 : 0)),
    ...FOLLOWER_TIER_FEATURES.map((t) => (tier === t ? 1 : 0)),
    isBarter ? 1 : 0,
  ];
  return new Float32Array(vec);
}

// The ONNX model produces a flat prediction across the mega tier (≥1M followers) because
// only 6 mega samples exist in training — not enough for within-tier splits.
// Post-prediction power-law scaling restores the correct curve beyond 1M followers,
// calibrated to rachelvennya's real data point: 7.7M followers → Rp 100M IDR.
// Formula: rate(F) = model_at_1M × (F / 1_000_000)^0.6
const MEGA_TIER_FLOOR = 1_000_000;
const MEGA_SCALE_EXPONENT = 0.6;

async function runInference(session: ort.InferenceSession, followers: number, platform: Platform): Promise<number> {
  const ortRuntime = await loadOrtRuntime();
  const features = buildFeatureVector(followers, platform, "other", false);
  const tensor = new ortRuntime.Tensor("float32", features, [1, features.length]);
  const result = await session.run({ features: tensor });
  const raw = (result["variable"]?.data as Float32Array)[0] ?? 0;
  return Math.max(0, Math.expm1(raw));
}

export async function predictRateCardIdr(followers: number, platform: string): Promise<number> {
  const session = await getSession();

  const normPlatform: Platform = (PLATFORM_FEATURES as readonly string[]).includes(platform)
    ? (platform as Platform)
    : "other";

  const base = await runInference(session, followers, normPlatform);

  if (followers <= MEGA_TIER_FLOOR) {
    return base;
  }

  // Scale the mega-tier baseline by the power law so predictions grow monotonically with followers.
  const megaBase = await runInference(session, MEGA_TIER_FLOOR, normPlatform);
  return megaBase * Math.pow(followers / MEGA_TIER_FLOOR, MEGA_SCALE_EXPONENT);
}
