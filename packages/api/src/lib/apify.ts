import { env } from "@if3250_k02_g01_dgw1/env/server";

import type { SocialPlatform } from "@if3250_k02_g01_dgw1/db/schema/kol";

const APIFY_ACTOR_IDS = {
  instagram: "apify~instagram-scraper",
  tiktok: "clockworks~tiktok-scraper",
} as const;

type AccountInput = {
  handle: string;
  platform: SocialPlatform;
  profileUrl?: string | null;
};

type SyncedMetrics = {
  averageLikes: number;
  averageViews: number;
  engagementRate: string;
  externalId?: string | null;
  followers: number;
  message?: string | null;
  syncStatus: "success" | "failed" | "pending";
};

function getActorId(platform: SocialPlatform) {
  switch (platform) {
    case "instagram":
      return APIFY_ACTOR_IDS.instagram;
    case "tiktok":
      return APIFY_ACTOR_IDS.tiktok;
    default:
      return undefined;
  }
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return 0;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildInput(account: AccountInput) {
  return {
    handle: account.handle,
    handles: [account.handle],
    userName: account.handle,
    username: account.handle,
    usernames: [account.handle],
    maxItems: 1,
    resultsLimit: 1,
    startUrls: account.profileUrl ? [{ url: account.profileUrl }] : undefined,
  };
}

function extractMetrics(item: Record<string, unknown> | undefined): SyncedMetrics {
  if (!item) {
    return {
      averageLikes: 0,
      averageViews: 0,
      engagementRate: "",
      followers: 0,
      message: "Apify tidak mengembalikan item data.",
      syncStatus: "failed",
    };
  }

  return {
    averageLikes: asNumber(
      item.averageLikes ?? item.avgLikes ?? item.likesAverage ?? item.likesAvg ?? item.likes,
    ),
    averageViews: asNumber(
      item.averageViews ?? item.avgViews ?? item.viewsAverage ?? item.viewsAvg ?? item.views,
    ),
    engagementRate: asText(item.engagementRate ?? item.er ?? item.engagement),
    externalId: asText(item.id ?? item.userId) || null,
    followers: asNumber(item.followers ?? item.followerCount ?? item.fans ?? item.fansCount),
    message: null,
    syncStatus: "success",
  };
}

export async function syncAccountWithApify(account: AccountInput): Promise<SyncedMetrics> {
  const actorId = getActorId(account.platform);

  if (!env.APIFY_API_TOKEN || !actorId) {
    return {
      averageLikes: 0,
      averageViews: 0,
      engagementRate: "",
      followers: 0,
      message: env.APIFY_API_TOKEN
        ? "Platform ini baru disiapkan di enum dan belum punya integrasi Apify."
        : "Konfigurasi Apify belum lengkap.",
      syncStatus: "pending",
    };
  }

  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}&clean=true&limit=1`,
    {
      body: JSON.stringify(buildInput(account)),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    return {
      averageLikes: 0,
      averageViews: 0,
      engagementRate: "",
      followers: 0,
      message: `Apify request gagal (${response.status}).`,
      syncStatus: "failed",
    };
  }

  const items = (await response.json()) as Array<Record<string, unknown>>;
  return extractMetrics(items[0]);
}