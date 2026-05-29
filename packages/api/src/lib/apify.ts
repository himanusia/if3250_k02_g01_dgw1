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

type ContentInput = {
  platform: SocialPlatform;
  url: string;
};

type ContentSyncErrorCode =
  | "INVALID_CONTENT_URL"
  | "CONTENT_NOT_FOUND"
  | "INVALID_CONTENT"
  | "APIFY_BAD_REQUEST"
  | "APIFY_TIMEOUT"
  | "APIFY_RATE_LIMIT"
  | "APIFY_UNAVAILABLE"
  | "APIFY_UNKNOWN"
  | "APIFY_NOT_CONFIGURED"
  | "PLATFORM_NOT_SUPPORTED";

type SyncedContentMetrics = {
  authorDisplayName: string;
  authorHandle: string;
  caption: string;
  commentCount: number;
  contentUrl: string;
  engagementRate: string;
  errorCode?: ContentSyncErrorCode;
  externalId?: string | null;
  likeCount: number;
  metadata?: Record<string, unknown> | null;
  message?: string | null;
  platform: SocialPlatform;
  postedAt?: string | null;
  shareCount: number;
  syncStatus: "success" | "failed";
  thumbnailUrl?: string | null;
  title: string;
  viewCount: number;
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

function asDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
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

export function normalizeContentUrl(url: string) {
  const trimmed = url.trim();

  if (!trimmed) {
    return null;
  }

  const candidates = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? [trimmed]
    : [`https://${trimmed.replace(/^\/+/, "")}`];

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }

      return parsed.toString();
    } catch {
      continue;
    }
  }

  return null;
}

export function detectContentPlatformFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");

    if (/^(?:m\.)?instagram\.com$/i.test(hostname) || /^instagr\.am$/i.test(hostname)) {
      return "instagram" as const;
    }

    if (/^(?:vm\.)?tiktok\.com$/i.test(hostname)) {
      return "tiktok" as const;
    }
  } catch {
    return null;
  }

  return null;
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
      syncStatus: "failed",
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

function buildContentInput(content: ContentInput) {
  const url = normalizeContentUrl(content.url);

  if (!url) {
    return null;
  }

  if (content.platform === "instagram") {
    return {
      directUrls: [url],
      resultsLimit: 1,
      resultsType: "posts",
      searchLimit: 1,
      startUrls: [{ url }],
      url,
      urls: [url],
    };
  }

  if (content.platform === "tiktok") {
    return {
      directUrls: [url],
      profiles: [url],
      resultsPerPage: 1,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadVideos: true,
      startUrls: [{ url }],
      url,
      urls: [url],
    };
  }

  return null;
}

function buildContentFailure(platform: SocialPlatform, url: string, errorCode: ContentSyncErrorCode, message: string): SyncedContentMetrics {
  return {
    authorDisplayName: "",
    authorHandle: "",
    caption: "",
    commentCount: 0,
    contentUrl: url,
    engagementRate: "",
    errorCode,
    externalId: null,
    likeCount: 0,
    metadata: null,
    message,
    platform,
    postedAt: null,
    shareCount: 0,
    syncStatus: "failed",
    thumbnailUrl: null,
    title: "",
    viewCount: 0,
  };
}

function extractContentFields(item: Record<string, unknown> | undefined, platform: SocialPlatform, url: string): SyncedContentMetrics {
  if (!item) {
    return buildContentFailure(platform, url, "CONTENT_NOT_FOUND", "Post tidak ditemukan atau tidak bisa diakses.");
  }

  if (typeof item.error === "string") {
    return buildContentFailure(
      platform,
      url,
      "INVALID_CONTENT",
      asText(item.errorDescription ?? item.error) || "Post tidak ditemukan atau tidak bisa diakses.",
    );
  }

  const rawCaption = asText(
    getValue(
      item,
      "caption",
      "text",
      "description",
      "desc",
      "edge_media_to_caption.edges.0.node.text",
      "edge_media_to_caption.edges.0.node.caption",
      "tweet.text",
      "videoDescription",
      "content",
    ),
  );
  const title = asText(
    getValue(
      item,
      "title",
      "shortCode",
      "shortcode",
      "desc",
      "videoDescription",
    ),
  ) || rawCaption;
  const externalId = asText(
    getValue(
      item,
      "id",
      "shortcode",
      "shortCode",
      "videoId",
      "awemeId",
      "postId",
      "code",
    ),
  ) || null;
  const authorDisplayName = asText(
    getValue(
      item,
      "owner.fullName",
      "owner.full_name",
      "owner.username",
      "ownerFullName",
      "ownerUsername",
      "user.fullName",
      "user.name",
      "authorMeta.nickName",
      "authorMeta.name",
      "authorMeta.signature",
      "author.name",
    ),
  );
  const authorHandle = asText(
    getValue(
      item,
      "owner.username",
      "owner.userName",
      "ownerUsername",
      "username",
      "user.username",
      "userName",
      "authorMeta.name",
      "authorMeta.uniqueId",
      "authorMeta.nickname",
      "author.name",
    ),
  );
  const thumbnailUrl = asText(
    getValue(
      item,
      "displayUrl",
      "display_url",
      "thumbnailUrl",
      "thumbnail_url",
      "cover",
      "coverUrl",
      "videoThumbnail",
      "thumbnail",
      "imageUrl",
    ),
  ) || null;
  const postedAt = asDate(
    getValue(
      item,
      "takenAtTimestamp",
      "taken_at_timestamp",
      "takenAt",
      "createdAt",
      "createdTime",
      "createTime",
      "timestamp",
      "publishTime",
      "date",
    ),
  );
  const likeCount = asNumber(
    getValue(
      item,
      "likesCount",
      "likeCount",
      "likes",
      "diggCount",
      "edge_media_preview_like.count",
      "edge_liked_by.count",
    ),
  );
  const viewCount = asNumber(
    getValue(
      item,
      "videoViewCount",
      "playCount",
      "viewsCount",
      "viewCount",
      "views",
      "play_count",
      "playcount",
    ),
  );
  const commentCount = asNumber(
    getValue(
      item,
      "commentsCount",
      "commentCount",
      "comments",
      "comment_count",
      "edge_media_to_comment.count",
    ),
  );
  const shareCount = asNumber(
    getValue(
      item,
      "shareCount",
      "sharesCount",
      "shares",
      "share_count",
    ),
  );
  const engagementRate = viewCount > 0
    ? formatRate(((likeCount + commentCount + shareCount) / viewCount) * 100)
    : asText(getValue(item, "engagementRate", "er", "engagement"));

  return {
    authorDisplayName,
    authorHandle,
    caption: rawCaption,
    commentCount,
    contentUrl: url,
    engagementRate,
    externalId,
    likeCount,
    metadata: {
      ...item,
      rawContentUrl: url,
    },
    platform,
    postedAt: postedAt ? postedAt.toISOString() : null,
    shareCount,
    syncStatus: "success",
    thumbnailUrl,
    title,
    viewCount,
  };
}

function extractInstagramContentMetrics(item: Record<string, unknown> | undefined, url: string): SyncedContentMetrics {
  return extractContentFields(item, "instagram", url);
}

function extractTikTokContentMetrics(items: Array<Record<string, unknown>>, url: string): SyncedContentMetrics {
  if (!items.length) {
    return buildContentFailure("tiktok", url, "CONTENT_NOT_FOUND", "Post tidak ditemukan atau tidak bisa diakses.");
  }

  const firstItem = items[0];

  if (firstItem && typeof firstItem.error === "string") {
    return buildContentFailure(
      "tiktok",
      url,
      "INVALID_CONTENT",
      asText(firstItem.errorDescription ?? firstItem.error) || "Post tidak ditemukan atau tidak bisa diakses.",
    );
  }

  const base = extractContentFields(firstItem, "tiktok", url);
  const likeCount = averageFromItems(items, ["diggCount", "likes", "likesCount", "likeCount"]);
  const viewCount = averageFromItems(items, ["playCount", "videoViewCount", "views", "viewCount"]);
  const commentCount = averageFromItems(items, ["commentCount", "commentsCount", "comments"]);
  const shareCount = averageFromItems(items, ["shareCount", "sharesCount", "shares"]);

  return {
    ...base,
    commentCount,
    likeCount,
    metadata: {
      ...base.metadata,
      latestPosts: items,
    },
    shareCount,
    viewCount,
  };
}

export async function syncContentWithApify(content: ContentInput): Promise<SyncedContentMetrics> {
  const url = normalizeContentUrl(content.url);

  if (!url) {
    return buildContentFailure(content.platform, content.url, "INVALID_CONTENT_URL", "Link konten harus berupa URL Instagram atau TikTok yang valid.");
  }

  const actorId = getActorId(content.platform);
  const input = buildContentInput({ platform: content.platform, url });

  if (!env.APIFY_API_TOKEN || !actorId || !input) {
    return buildContentFailure(
      content.platform,
      url,
      env.APIFY_API_TOKEN ? "PLATFORM_NOT_SUPPORTED" : "APIFY_NOT_CONFIGURED",
      env.APIFY_API_TOKEN
        ? "Platform ini belum punya integrasi Apify untuk scraping konten."
        : "Konfigurasi Apify belum lengkap.",
    );
  }

  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}&clean=true&limit=1`,
    {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[apify] content request failed", {
      actorId,
      platform: content.platform,
      response: errorText,
      status: response.status,
      url,
    });

    return buildContentFailure(
      content.platform,
      url,
      response.status === 400
        ? "APIFY_BAD_REQUEST"
        : response.status === 408
          ? "APIFY_TIMEOUT"
          : response.status === 429
            ? "APIFY_RATE_LIMIT"
            : response.status >= 500
              ? "APIFY_UNAVAILABLE"
              : "APIFY_UNKNOWN",
      response.status === 404
        ? "Post tidak ditemukan atau tidak bisa diakses."
        : `Apify request gagal (${response.status}).`,
    );
  }

  const payload = await response.json() as unknown;
  const items = Array.isArray(payload)
    ? payload.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : typeof payload === "object" && payload !== null
      ? [payload as Record<string, unknown>]
      : [];

  if (content.platform === "tiktok") {
    return extractTikTokContentMetrics(items, url);
  }

  return extractInstagramContentMetrics(items[0], url);
}
