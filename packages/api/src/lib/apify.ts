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

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, unknown>>;
  }

  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function averageFromItems(items: Array<Record<string, unknown>>, keys: string[]) {
  const values = items
    .map((item) => {
      for (const key of keys) {
        const value = asNumber(item[key]);

        if (value > 0) {
          return value;
        }
      }

      return 0;
    })
    .filter((value) => value > 0);

  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@+/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+|\/+$/g, "");
}

function getProfileUrl(account: AccountInput) {
  if (account.profileUrl?.trim()) {
    return account.profileUrl.trim();
  }

  const handle = normalizeHandle(account.handle);

  switch (account.platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    default:
      return handle;
  }
}

function buildInput(account: AccountInput) {
  const handle = normalizeHandle(account.handle);
  const profileUrl = getProfileUrl(account);

  if (account.platform === "instagram") {
    return {
      addParentData: false,
      directUrls: [profileUrl],
      enhanceUserSearchWithFacebookPage: false,
      resultsLimit: 1,
      resultsType: "details",
      searchLimit: 1,
      searchType: "user",
      startUrls: [{ url: profileUrl }],
      userName: handle,
      username: handle,
      usernames: [handle],
    };
  }

  return {
    handle,
    handles: [handle],
    maxItems: 1,
    profile: profileUrl,
    resultsLimit: 1,
    startUrls: [{ url: profileUrl }],
    url: profileUrl,
    userName: handle,
    username: handle,
    usernames: [handle],
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

  if (typeof item.error === "string") {
    return {
      averageLikes: 0,
      averageViews: 0,
      engagementRate: "",
      followers: 0,
      message: asText(item.errorDescription ?? item.error) || "Apify tidak menemukan data akun.",
      syncStatus: "failed",
    };
  }

  const latestPosts = asRecordArray(item.latestPosts ?? item.posts ?? item.latestVideos);
  const averageLikes =
    asNumber(item.averageLikes ?? item.avgLikes ?? item.likesAverage ?? item.likesAvg ?? item.likes) ||
    averageFromItems(latestPosts, ["likesCount", "likes", "likes_count"]);
  const averageViews =
    asNumber(item.averageViews ?? item.avgViews ?? item.viewsAverage ?? item.viewsAvg ?? item.views) ||
    averageFromItems(latestPosts, ["videoViewCount", "videoPlayCount", "playCount", "viewsCount", "views"]);

  return {
    averageLikes,
    averageViews,
    engagementRate: asText(item.engagementRate ?? item.er ?? item.engagement),
    externalId: asText(item.id ?? item.userId) || null,
    followers: asNumber(
      item.followers ?? item.followersCount ?? item.followerCount ?? item.fans ?? item.fansCount,
    ),
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
    const errorText = await response.text();
    console.error("[apify] request failed", {
      actorId,
      handle: account.handle,
      platform: account.platform,
      response: errorText,
      status: response.status,
    });

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
  console.log(
    "[apify] response",
    JSON.stringify(
      {
        actorId,
        handle: account.handle,
        item: items[0] ?? null,
        platform: account.platform,
      },
      null,
      2,
    ),
  );

  return extractMetrics(items[0]);
}