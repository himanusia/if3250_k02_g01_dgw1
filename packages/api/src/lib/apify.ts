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
  biography?: string | null;
  errorCode?:
    | "INVALID_ACCOUNT"
    | "NO_DATA"
    | "APIFY_BAD_REQUEST"
    | "APIFY_TIMEOUT"
    | "APIFY_RATE_LIMIT"
    | "APIFY_UNAVAILABLE"
    | "APIFY_UNKNOWN"
    | "APIFY_NOT_CONFIGURED"
    | "PLATFORM_NOT_SUPPORTED";
  engagementRate: string;
  externalId?: string | null;
  followers: number;
  metadata?: Record<string, unknown> | null;
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

function decodeHtmlEntities(value: string) {
	return value
		.replace(/&amp;/gi, "&")
		.replace(/&#38;/gi, "&")
		.replace(/&#x26;/gi, "&");
}

function asUrlText(value: unknown) {
	const text = asText(value);

	return text ? decodeHtmlEntities(text) : "";
}

function firstText(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = asUrlText(getValue(record, key));

    if (value) {
      return value;
    }
  }

  return "";
}

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, unknown>>;
  }

  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getValue(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }

    if (key.includes(".")) {
      const value = key.split(".").reduce<unknown>((current, part) => {
        if (typeof current === "object" && current !== null && part in (current as Record<string, unknown>)) {
          return (current as Record<string, unknown>)[part];
        }

        return undefined;
      }, record);

      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
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
    return decodeHtmlEntities(account.profileUrl.trim());
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
    profiles: [profileUrl],
    resultsPerPage: 10,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadVideos: false,
  };
}

function formatRate(value: number) {
  return value > 0 ? `${value.toFixed(2)}%` : "";
}

function extractInstagramMetrics(item: Record<string, unknown> | undefined): SyncedMetrics {
  if (!item) {
    return {
      averageLikes: 0,
      averageViews: 0,
      biography: null,
      errorCode: "NO_DATA",
      engagementRate: "",
      followers: 0,
      metadata: null,
      message: "Apify tidak mengembalikan item data.",
      syncStatus: "failed",
    };
  }

  if (typeof item.error === "string") {
    return {
      averageLikes: 0,
      averageViews: 0,
      biography: null,
      errorCode: "INVALID_ACCOUNT",
      engagementRate: "",
      followers: 0,
      metadata: item,
      message: asText(item.errorDescription ?? item.error) || "Apify tidak menemukan data akun.",
      syncStatus: "failed",
    };
  }

  const latestPosts = asRecordArray(item.latestPosts ?? item.posts ?? item.latestVideos);
  const latestIgtvVideos = asRecordArray(
    item.latestIgtvVideos ?? item.latestIGTVVideos ?? item.latestigtvvideos ?? item.igtvVideos,
  );
  const profilePicUrlHD = firstText(
    item,
    "profilePicUrlHD",
    "profilePicUrlHd",
    "avatarUrl",
    "avatarUrlHD",
    "profile_pic_url_hd",
    "owner.profilePicUrlHD",
    "user.profilePicUrlHD",
  );
  const profilePicUrl = firstText(
    item,
    "profilePicUrl",
    "profile_pic_url",
    "avatarUrl",
    "owner.profilePicUrl",
    "user.profilePicUrl",
  ) || profilePicUrlHD;
  const averageLikes =
    asNumber(item.averageLikes ?? item.avgLikes ?? item.likesAverage ?? item.likesAvg ?? item.likes) ||
    averageFromItems(latestPosts, ["likesCount", "likes", "likes_count"]);
  const averageViews =
    asNumber(item.averageViews ?? item.avgViews ?? item.viewsAverage ?? item.viewsAvg ?? item.views) ||
    averageFromItems(latestPosts, ["videoViewCount", "videoPlayCount", "playCount", "viewsCount", "views"]);
  const averageComments =
		asNumber(item.averageComments ?? item.avgComments ?? item.commentsAverage ?? item.commentsAvg ?? item.comments) ||
		averageFromItems(latestPosts, ["commentsCount", "commentCount", "comments", "comments_count"]);
  const followers = asNumber(
		item.followers ?? item.followersCount ?? item.followerCount ?? item.fans ?? item.fansCount,
	);
  const engagementRate =
		asText(item.engagementRate ?? item.er ?? item.engagement) ||
		(followers > 0 ? formatRate(((averageLikes + averageComments) / followers) * 100) : "");

  return {
    averageLikes,
    averageViews,
    biography: asText(item.biography ?? item.bio) || null,
    engagementRate,
    externalId: asText(item.id ?? item.userId) || null,
    followers,
    metadata: {
		...item,
		averageComments,
		avatarUrl: profilePicUrlHD || profilePicUrl || null,
		latestIgtvVideos,
		latestPosts,
		profilePicUrl: profilePicUrl || null,
		profilePicUrlHD: profilePicUrlHD || null,
	},
    message: null,
    syncStatus: "success",
  };
}

function extractTikTokMetrics(items: Array<Record<string, unknown>>): SyncedMetrics {
  if (!items.length) {
    return {
      averageLikes: 0,
      averageViews: 0,
      biography: null,
      errorCode: "NO_DATA",
      engagementRate: "",
      followers: 0,
      metadata: null,
      message: "Apify tidak mengembalikan item data.",
      syncStatus: "failed",
    };
  }

  const firstItem = items[0];

  if (firstItem && typeof firstItem.error === "string") {
    return {
      averageLikes: 0,
      averageViews: 0,
      biography: null,
      errorCode: "INVALID_ACCOUNT",
      engagementRate: "",
      followers: 0,
      metadata: firstItem,
      message: asText(firstItem.errorDescription ?? firstItem.error) || "Apify tidak menemukan data akun.",
      syncStatus: "failed",
    };
  }

  const authorMeta = asRecord(getValue(firstItem, "authorMeta"));
  const averageLikes = averageFromItems(items, ["diggCount", "likes", "likesCount"]);
  const averageViews = averageFromItems(items, ["playCount", "videoViewCount", "views"]);
  const averageComments = averageFromItems(items, ["commentCount", "commentsCount"]);
  const averageShares = averageFromItems(items, ["shareCount", "sharesCount"]);
  const followers = asNumber(getValue(firstItem, "authorMeta.fans", "authorMeta.followerCount", "authorMeta.followers"));
  const engagementBase = averageViews > 0 ? averageViews : followers;
  const engagementRate =
    engagementBase > 0 ? formatRate(((averageLikes + averageComments + averageShares) / engagementBase) * 100) : "";

  return {
    averageLikes,
    averageViews,
    biography: asText(getValue(firstItem, "authorMeta.signature", "authorMeta.bio", "authorMeta.description")) || null,
    engagementRate,
    externalId: asText(getValue(firstItem, "authorMeta.id", "authorMeta.userId")) || null,
    followers,
    metadata: {
      authorMeta,
      latestPosts: items,
    },
    message: null,
    syncStatus: "success",
  };
}

function extractMetrics(platform: SocialPlatform, items: Array<Record<string, unknown>>): SyncedMetrics {
  if (platform === "tiktok") {
    return extractTikTokMetrics(items);
  }

  return extractInstagramMetrics(items[0]);
}

export async function syncAccountWithApify(account: AccountInput): Promise<SyncedMetrics> {
  const actorId = getActorId(account.platform);
  const resultLimit = account.platform === "tiktok" ? 10 : 1;

  if (!env.APIFY_API_TOKEN || !actorId) {
    return {
      averageLikes: 0,
      averageViews: 0,
      biography: null,
      errorCode: env.APIFY_API_TOKEN ? "PLATFORM_NOT_SUPPORTED" : "APIFY_NOT_CONFIGURED",
      engagementRate: "",
      followers: 0,
      metadata: null,
      message: env.APIFY_API_TOKEN
        ? "Platform ini baru disiapkan di enum dan belum punya integrasi Apify."
        : "Konfigurasi Apify belum lengkap.",
      syncStatus: "pending",
    };
  }

  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}&clean=true&limit=${resultLimit}`,
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
      biography: null,
      errorCode:
        response.status === 400
          ? "APIFY_BAD_REQUEST"
          : response.status === 408
            ? "APIFY_TIMEOUT"
            : response.status === 429
              ? "APIFY_RATE_LIMIT"
              : response.status >= 500
                ? "APIFY_UNAVAILABLE"
                : "APIFY_UNKNOWN",
      engagementRate: "",
      followers: 0,
      metadata: null,
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
        itemCount: items.length,
        item: items[0] ?? null,
        platform: account.platform,
      },
      null,
      2,
    ),
  );

  const metrics = extractMetrics(account.platform, items);

  if (metrics.errorCode === "INVALID_ACCOUNT" || metrics.errorCode === "NO_DATA") {
    const contextMessage = `Akun ${account.platform} @${normalizeHandle(account.handle)} tidak valid atau data tidak ditemukan.`;
    return {
      ...metrics,
      message: metrics.message ? `${contextMessage}` : contextMessage,
    };
  }

  return metrics;
}