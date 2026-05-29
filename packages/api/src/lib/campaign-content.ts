import { db } from "@if3250_k02_g01_dgw1/db";
import { campaign, campaignContent, campaignKol } from "@if3250_k02_g01_dgw1/db/schema/campaign";
import { kolAccount, kolProfile, type SocialPlatform } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { ORPCError } from "@orpc/server";
import { waitUntil } from "@vercel/functions";
import { and, desc, eq, ilike } from "drizzle-orm";

import { syncContentWithApify } from "./apify";

export type CampaignKolLink = {
  avatarUrl: string | null;
  campaignId: number;
  displayName: string;
  handles: string[];
  id: number;
};

export type CampaignContentRecord = {
  archivedAt: string | null;
  authorDisplayName: string;
  authorHandle: string;
  budgetIdr: number | null;
  campaignId: number;
  caption: string;
  commentCount: number;
  contentType: string;
  contentUrl: string;
  createdAt: string;
  estimatedCommentCount: number;
  estimatedLikeCount: number;
  estimatedShareCount: number;
  estimatedViewCount: number;
  externalId: string | null;
  engagementRate: string;
  id: number;
  isFyp: boolean | null;
  kolDisplayName: string;
  kolHandles: string[];
  kolId: number;
  likeCount: number;
  metadata: Record<string, unknown> | null;
  platform: SocialPlatform;
  postedAt: string | null;
  shareCount: number;
  syncErrorCode: string | null;
  syncMessage: string | null;
  syncStatus: "pending" | "success" | "failed";
  syncedAt: string | null;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: string;
  viewCount: number;
};

export type CampaignContentGroupRecord = {
  avatarUrl: string | null;
  contents: CampaignContentRecord[];
  displayName: string;
  handles: string[];
  kolId: number;
};

export type CampaignDetailRecord = {
  brand: string;
  budgetIdr: number;
  contentsByKol: CampaignContentGroupRecord[];
  createdAt: string;
  createdByUserId: string | null;
  description: string;
  id: number;
  kols: CampaignKolLink[];
  keywords: string;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  selectedKolIds: number[];
  status: "draft" | "active" | "completed" | "archived";
  targetContentCount: number;
  targetFollowerTier: string;
  targetKolCount: number;
  updatedAt: string;
};

type CampaignContentInputRow = {
  budgetIdr?: number | null;
  caption?: string;
  contentType?: "post" | "reel" | "story";
  contentUrl?: string;
  estimatedCommentCount?: number;
  estimatedLikeCount?: number;
  estimatedShareCount?: number;
  estimatedViewCount?: number;
  isFyp?: boolean | null;
  kolDisplayName?: string;
  kolHandle?: string;
  kolId?: number | null;
  likeCount?: number;
  platform?: SocialPlatform;
  shareCount?: number;
  title?: string;
  viewCount?: number;
};

type CampaignContentInput = {
  campaignId: number;
  contents: CampaignContentInputRow[];
};

type CampaignContentRow = {
  archivedAt: Date | null;
  authorDisplayName: string;
  authorHandle: string;
  budgetIdr: number | null;
  campaignId: number;
  caption: string;
  commentCount: number;
  contentType: string;
  contentUrl: string;
  createdAt: Date;
  estimatedCommentCount: number;
  estimatedLikeCount: number;
  estimatedShareCount: number;
  estimatedViewCount: number;
  externalId: string | null;
  engagementRate: string;
  id: number;
  isFyp: boolean | null;
  kolDisplayName: string;
  kolId: number;
  likeCount: number;
  metadata: Record<string, unknown> | null;
  platform: SocialPlatform;
  postedAt: Date | null;
  shareCount: number;
  syncErrorCode: string | null;
  syncMessage: string | null;
  syncStatus: "pending" | "success" | "failed";
  syncedAt: Date | null;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: Date;
  viewCount: number;
};

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function toShortDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedValue(record: Record<string, unknown>, key: string) {
  return key.split(".").reduce<unknown>((current, part) => {
    if (isRecord(current) && part in current) {
      return current[part];
    }

    return undefined;
  }, record);
}

function getMetadataText(metadata: Record<string, unknown> | null, ...keys: string[]) {
  if (!metadata) {
    return "";
  }

  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(metadata, key) : metadata[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getAccountAvatarUrl(metadata: Record<string, unknown> | null) {
  return (
    getMetadataText(
      metadata,
      "profilePicUrlHD",
      "profilePicUrlHd",
      "profilePicUrl",
      "avatarUrl",
      "avatarUrlHD",
      "profile_pic_url_hd",
      "profile_pic_url",
      "authorMeta.avatar",
      "authorMeta.originalAvatarUrl",
    ) || null
  );
}

function normalizeCampaignContentRow(row: CampaignContentRow, handles: string[]): CampaignContentRecord {
  return {
    archivedAt: toIso(row.archivedAt),
    authorDisplayName: row.authorDisplayName,
    authorHandle: row.authorHandle,
    budgetIdr: row.budgetIdr,
    campaignId: row.campaignId,
    caption: row.caption,
    commentCount: row.commentCount,
    contentType: row.contentType,
    contentUrl: row.contentUrl,
    createdAt: row.createdAt.toISOString(),
    estimatedCommentCount: row.estimatedCommentCount,
    estimatedLikeCount: row.estimatedLikeCount,
    estimatedShareCount: row.estimatedShareCount,
    estimatedViewCount: row.estimatedViewCount,
    externalId: row.externalId,
    engagementRate: row.engagementRate,
    id: row.id,
    isFyp: row.isFyp,
    kolDisplayName: row.kolDisplayName,
    kolHandles: handles,
    kolId: row.kolId,
    likeCount: row.likeCount,
    metadata: row.metadata,
    platform: row.platform,
    postedAt: toIso(row.postedAt),
    shareCount: row.shareCount,
    syncErrorCode: row.syncErrorCode,
    syncMessage: row.syncMessage,
    syncStatus: row.syncStatus,
    syncedAt: toIso(row.syncedAt),
    thumbnailUrl: row.thumbnailUrl,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    viewCount: row.viewCount,
  };
}

async function loadCampaignKolLinks(campaignId: number) {
  const rows = await db
    .select({
      campaignId: campaignKol.campaignId,
      displayName: kolProfile.displayName,
      handle: kolAccount.handle,
      kolId: kolProfile.id,
      metadata: kolAccount.metadata,
      platform: kolAccount.platform,
    })
    .from(campaignKol)
    .innerJoin(kolProfile, eq(campaignKol.kolId, kolProfile.id))
    .leftJoin(kolAccount, eq(kolAccount.kolId, kolProfile.id))
    .where(eq(campaignKol.campaignId, campaignId));

  const grouped = new Map<number, CampaignKolLink>();

  for (const row of rows) {
    const current = grouped.get(row.kolId) ?? {
      campaignId: row.campaignId,
      avatarUrl: null,
      displayName: row.displayName,
      handles: [],
      id: row.kolId,
    };

    current.avatarUrl ??= getAccountAvatarUrl((row.metadata ?? null) as Record<string, unknown> | null);

    if (row.handle && !current.handles.includes(`${row.platform}: ${row.handle}`)) {
      current.handles.push(`${row.platform}: ${row.handle}`);
    }

    grouped.set(row.kolId, current);
  }

  return Array.from(grouped.values()).sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" }));
}

async function loadCampaignContentRows(campaignId: number, linksByKolId: Map<number, CampaignKolLink>) {
  const rows = await db
    .select({
      archivedAt: campaignContent.archivedAt,
      authorDisplayName: campaignContent.authorDisplayName,
      authorHandle: campaignContent.authorHandle,
      budgetIdr: campaignContent.budgetIdr,
      campaignId: campaignContent.campaignId,
      caption: campaignContent.caption,
      commentCount: campaignContent.commentCount,
      contentType: campaignContent.contentType,
      contentUrl: campaignContent.contentUrl,
      createdAt: campaignContent.createdAt,
      estimatedCommentCount: campaignContent.estimatedCommentCount,
      estimatedLikeCount: campaignContent.estimatedLikeCount,
      estimatedShareCount: campaignContent.estimatedShareCount,
      estimatedViewCount: campaignContent.estimatedViewCount,
      externalId: campaignContent.externalId,
      engagementRate: campaignContent.engagementRate,
      id: campaignContent.id,
      isFyp: campaignContent.isFyp,
      kolDisplayName: kolProfile.displayName,
      kolId: campaignContent.kolId,
      likeCount: campaignContent.likeCount,
      metadata: campaignContent.metadata,
      platform: campaignContent.platform,
      postedAt: campaignContent.postedAt,
      shareCount: campaignContent.shareCount,
      syncErrorCode: campaignContent.syncErrorCode,
      syncMessage: campaignContent.syncMessage,
      syncStatus: campaignContent.syncStatus,
      syncedAt: campaignContent.syncedAt,
      thumbnailUrl: campaignContent.thumbnailUrl,
      title: campaignContent.title,
      updatedAt: campaignContent.updatedAt,
      viewCount: campaignContent.viewCount,
    })
    .from(campaignContent)
    .innerJoin(kolProfile, eq(campaignContent.kolId, kolProfile.id))
    .where(eq(campaignContent.campaignId, campaignId))
    .orderBy(desc(campaignContent.updatedAt), desc(campaignContent.createdAt));

  return rows.map((row) =>
    normalizeCampaignContentRow(
      {
        ...row,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
      },
      linksByKolId.get(row.kolId)?.handles ?? [],
    ),
  );
}

function groupCampaignContentRows(rows: CampaignContentRecord[], links: CampaignKolLink[]) {
  const linksByKolId = new Map(links.map((link) => [link.id, link] as const));
  const groups = new Map<number, CampaignContentGroupRecord>();

  for (const row of rows) {
    const current = groups.get(row.kolId) ?? {
      avatarUrl: linksByKolId.get(row.kolId)?.avatarUrl ?? null,
      contents: [],
      displayName: row.kolDisplayName,
      handles: linksByKolId.get(row.kolId)?.handles ?? [],
      kolId: row.kolId,
    };

    current.contents.push(row);
    groups.set(row.kolId, current);
  }

  return Array.from(groups.values()).sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" }));
}

export function normalizeContentUrl(rawUrl: string) {
  const value = rawUrl.trim();

  if (!value) {
    return null;
  }

  const candidates = value.startsWith("http://") || value.startsWith("https://")
    ? [value]
    : [`https://${value.replace(/^\/+/, "")}`];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        continue;
      }

      return url.toString();
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

export function detectContentTypeFromUrl(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase();

    if (path.includes("/stories/")) {
      return "story" as const;
    }

    if (path.includes("/reel/") || path.includes("/video/")) {
      return "reel" as const;
    }
  } catch {
    return null;
  }

  return null;
}

function contentTypeFromRow(row: CampaignContentInputRow, normalizedUrl: string | null) {
  if (normalizedUrl) {
    return detectContentTypeFromUrl(normalizedUrl) ?? row.contentType ?? "post";
  }

  return row.contentType ?? null;
}

function ensureCampaignContentUrl(rowIndex: number, row: CampaignContentInputRow, existingUrls: Set<string>, seenUrls: Set<string>) {
  const normalizedUrl = normalizeContentUrl(row.contentUrl ?? "");

  if (!normalizedUrl) {
    throw new ORPCError("BAD_REQUEST", {
      data: { reason: "INVALID_CONTENT_URL" },
      message: `Baris ${rowIndex + 1}: link konten harus berupa URL Instagram atau TikTok yang valid.`,
    });
  }

  if (seenUrls.has(normalizedUrl)) {
    throw new ORPCError("BAD_REQUEST", {
      data: { reason: "DUPLICATE_CONTENT_URL" },
      message: `Baris ${rowIndex + 1}: link konten duplikat di form.`,
    });
  }

  if (existingUrls.has(normalizedUrl)) {
    throw new ORPCError("BAD_REQUEST", {
      data: { reason: "CONTENT_ALREADY_EXISTS" },
      message: `Link konten ${normalizedUrl} sudah ada di campaign ini.`,
    });
  }

  const platform = detectContentPlatformFromUrl(normalizedUrl);

  if (!platform) {
    throw new ORPCError("BAD_REQUEST", {
      data: { reason: "UNSUPPORTED_CONTENT_PLATFORM" },
      message: `Baris ${rowIndex + 1}: link konten harus berasal dari Instagram atau TikTok.`,
    });
  }

  seenUrls.add(normalizedUrl);

  return {
    contentUrl: normalizedUrl,
    platform,
  };
}

function createManualContentUrl(campaignId: number, rowIndex: number) {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${rowIndex}-${Math.random().toString(36).slice(2)}`;

  return `manual://campaign/${campaignId}/${randomId}`;
}

function normalizeOptionalCount(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value ?? 0)) : 0;
}

function normalizeOptionalBudget(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function getRateCardSuggested(rateCard: unknown, contentType: string) {
  if (!rateCard || typeof rateCard !== "object") return null;
  const key = contentType === "reel" ? "reel" : contentType === "story" ? "story" : "post";
  const section = (rateCard as Record<string, unknown>)[key];
  if (!section || typeof section !== "object") return null;
  const suggested = (section as Record<string, unknown>).suggested;
  return typeof suggested === "number" && Number.isFinite(suggested) ? Math.round(suggested) : null;
}

async function loadKolContentDefaults(kolId: number, contentType: string) {
  const [profile] = await db
    .select({
      actualRateCard: kolProfile.actualRateCard,
      averageLikes: kolProfile.averageLikes,
      averageViews: kolProfile.averageViews,
      estimatedRateCard: kolProfile.estimatedRateCard,
      totalFollowers: kolProfile.totalFollowers,
    })
    .from(kolProfile)
    .where(eq(kolProfile.id, kolId))
    .limit(1);

  if (!profile) {
    return {
      budgetIdr: null,
      estimatedCommentCount: 0,
      estimatedLikeCount: 0,
      estimatedShareCount: 0,
      estimatedViewCount: 0,
    };
  }

  const estimatedViewCount = Math.max(0, Math.round(profile.averageViews || Math.max(profile.totalFollowers * 0.2, 0)));
  const estimatedLikeCount = Math.max(0, Math.round(profile.averageLikes || estimatedViewCount * 0.04));
  const estimatedCommentCount = Math.max(0, Math.round(estimatedLikeCount * 0.08));
  const estimatedShareCount = Math.max(0, Math.round(estimatedLikeCount * 0.04));

  return {
    budgetIdr: getRateCardSuggested(profile.actualRateCard, contentType) ?? getRateCardSuggested(profile.estimatedRateCard, contentType),
    estimatedCommentCount,
    estimatedLikeCount,
    estimatedShareCount,
    estimatedViewCount,
  };
}

function normalizeOptionalHandle(value: string | undefined) {
  return value?.trim().replace(/^@/, "") ?? "";
}

function platformFromRow(row: CampaignContentInputRow, normalizedUrl: string | null) {
  if (row.platform) return row.platform;
  if (normalizedUrl) return detectContentPlatformFromUrl(normalizedUrl);
  return null;
}

async function ensureCampaignKolLink(campaignId: number, row: CampaignContentInputRow, allowedKolIds: Set<number>) {
  if (row.kolId && allowedKolIds.has(row.kolId)) {
    return row.kolId;
  }

  if (row.kolId && !allowedKolIds.has(row.kolId)) {
    await db.insert(campaignKol).values({ campaignId, kolId: row.kolId }).onConflictDoNothing();
    allowedKolIds.add(row.kolId);
    return row.kolId;
  }

  const handle = normalizeOptionalHandle(row.kolHandle);
  const platform = row.platform;

  if (handle && platform) {
    const [existing] = await db
      .select({ id: kolAccount.kolId })
      .from(kolAccount)
      .where(and(ilike(kolAccount.handle, handle), eq(kolAccount.platform, platform)))
      .limit(1);

    if (existing) {
      await db.insert(campaignKol).values({ campaignId, kolId: existing.id }).onConflictDoNothing();
      allowedKolIds.add(existing.id);
      return existing.id;
    }
  }

  const displayName = row.kolDisplayName?.trim() || handle || "KOL belum terdaftar";
  const [createdProfile] = await db
    .insert(kolProfile)
    .values({
      displayName,
      keywords: "",
      syncMessage: handle ? "Belum disinkronkan." : "KOL belum terdaftar dari konten campaign.",
      syncStatus: handle ? "pending" : "failed",
    })
    .returning({ id: kolProfile.id });

  if (!createdProfile) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Gagal membuat KOL otomatis." });
  }

  if (handle && platform) {
    await db.insert(kolAccount).values({
      handle,
      kolId: createdProfile.id,
      platform,
      profileUrl: null,
      syncMessage: "Belum disinkronkan.",
      syncStatus: "pending",
    });
  }

  await db.insert(campaignKol).values({ campaignId, kolId: createdProfile.id }).onConflictDoNothing();
  allowedKolIds.add(createdProfile.id);
  return createdProfile.id;
}

async function unlinkUnusedPlaceholderKol(campaignId: number, kolId: number) {
  const [profile] = await db
    .select({ displayName: kolProfile.displayName })
    .from(kolProfile)
    .where(eq(kolProfile.id, kolId))
    .limit(1);

  if (profile?.displayName !== "KOL belum terdaftar") {
    return;
  }

  const [remainingContent] = await db
    .select({ id: campaignContent.id })
    .from(campaignContent)
    .where(and(eq(campaignContent.campaignId, campaignId), eq(campaignContent.kolId, kolId)))
    .limit(1);

  if (!remainingContent) {
    await db.delete(campaignKol).where(and(eq(campaignKol.campaignId, campaignId), eq(campaignKol.kolId, kolId)));
  }
}

async function loadCampaignContentRow(contentId: number) {
  const [row] = await db
    .select({
      archivedAt: campaignContent.archivedAt,
      authorDisplayName: campaignContent.authorDisplayName,
      authorHandle: campaignContent.authorHandle,
      budgetIdr: campaignContent.budgetIdr,
      campaignId: campaignContent.campaignId,
      caption: campaignContent.caption,
      commentCount: campaignContent.commentCount,
      contentType: campaignContent.contentType,
      contentUrl: campaignContent.contentUrl,
      createdAt: campaignContent.createdAt,
      estimatedCommentCount: campaignContent.estimatedCommentCount,
      estimatedLikeCount: campaignContent.estimatedLikeCount,
      estimatedShareCount: campaignContent.estimatedShareCount,
      estimatedViewCount: campaignContent.estimatedViewCount,
      externalId: campaignContent.externalId,
      engagementRate: campaignContent.engagementRate,
      id: campaignContent.id,
      isFyp: campaignContent.isFyp,
      kolDisplayName: kolProfile.displayName,
      kolId: campaignContent.kolId,
      likeCount: campaignContent.likeCount,
      metadata: campaignContent.metadata,
      platform: campaignContent.platform,
      postedAt: campaignContent.postedAt,
      shareCount: campaignContent.shareCount,
      syncErrorCode: campaignContent.syncErrorCode,
      syncMessage: campaignContent.syncMessage,
      syncStatus: campaignContent.syncStatus,
      syncedAt: campaignContent.syncedAt,
      thumbnailUrl: campaignContent.thumbnailUrl,
      title: campaignContent.title,
      updatedAt: campaignContent.updatedAt,
      viewCount: campaignContent.viewCount,
    })
    .from(campaignContent)
    .innerJoin(kolProfile, eq(campaignContent.kolId, kolProfile.id))
    .where(eq(campaignContent.id, contentId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      data: { reason: "CONTENT_NOT_FOUND" },
      message: "Konten campaign tidak ditemukan.",
    });
  }

  return row;
}

async function updateCampaignContentMetrics(contentId: number, metrics: Awaited<ReturnType<typeof syncContentWithApify>>) {
  const current = await loadCampaignContentRow(contentId);

  if (metrics.syncStatus === "success") {
    const authorHandle = metrics.authorHandle.replace(/^@/, "").trim();
    let targetKolId = current.kolId;

    if (authorHandle) {
      const [matchingAccount] = await db
        .select({ kolId: kolAccount.kolId })
        .from(kolAccount)
        .where(and(ilike(kolAccount.handle, authorHandle), eq(kolAccount.platform, metrics.platform)))
        .limit(1);

      if (matchingAccount) {
        targetKolId = matchingAccount.kolId;
        await db.insert(campaignKol).values({ campaignId: current.campaignId, kolId: targetKolId }).onConflictDoNothing();
      } else {
        await db
          .update(kolProfile)
          .set({
            displayName: "KOL belum terdaftar",
            syncMessage: "KOL belum terdaftar dari konten campaign.",
            syncStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(kolProfile.id, current.kolId));
      }
    }

    await db
      .update(campaignContent)
      .set({
        authorDisplayName: metrics.authorDisplayName || current.kolDisplayName,
        authorHandle: metrics.authorHandle,
        caption: metrics.caption,
        commentCount: metrics.commentCount,
        engagementRate: metrics.engagementRate,
        externalId: metrics.externalId,
        likeCount: metrics.likeCount,
        kolId: targetKolId,
        metadata: metrics.metadata,
        postedAt: metrics.postedAt ? new Date(metrics.postedAt) : null,
        shareCount: metrics.shareCount,
        syncErrorCode: null,
        syncMessage: null,
        syncStatus: "success",
        syncedAt: new Date(),
        thumbnailUrl: metrics.thumbnailUrl,
        title: metrics.title,
        updatedAt: new Date(),
        viewCount: metrics.viewCount,
      })
      .where(eq(campaignContent.id, contentId));

    if (authorHandle) {
      const [existingAccount] = await db
        .select({ id: kolAccount.id })
        .from(kolAccount)
        .where(
          and(
            eq(kolAccount.kolId, targetKolId),
            eq(kolAccount.platform, metrics.platform),
            eq(kolAccount.handle, authorHandle),
          ),
        )
        .limit(1);

      if (!existingAccount) {
        try {
          await db.insert(kolAccount).values({
            handle: authorHandle,
            kolId: targetKolId,
            platform: metrics.platform,
            profileUrl: null,
          });
        } catch {
          // Another KOL may already own this handle. Keep content sync successful.
        }
      }
    }

    if (targetKolId !== current.kolId) {
      await unlinkUnusedPlaceholderKol(current.campaignId, current.kolId);
    }
  } else {
    await db
      .update(campaignContent)
      .set({
        syncErrorCode: metrics.errorCode ?? null,
        syncMessage: metrics.message ?? null,
        syncStatus: "failed",
        syncedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(campaignContent.id, contentId));
  }

  const links = await loadCampaignKolLinks(current.campaignId);
  const linkMap = new Map(links.map((link) => [link.id, link] as const));
  const [latest] = await db
    .select({
      archivedAt: campaignContent.archivedAt,
      authorDisplayName: campaignContent.authorDisplayName,
      authorHandle: campaignContent.authorHandle,
      budgetIdr: campaignContent.budgetIdr,
      campaignId: campaignContent.campaignId,
      caption: campaignContent.caption,
      commentCount: campaignContent.commentCount,
      contentType: campaignContent.contentType,
      contentUrl: campaignContent.contentUrl,
      createdAt: campaignContent.createdAt,
      estimatedCommentCount: campaignContent.estimatedCommentCount,
      estimatedLikeCount: campaignContent.estimatedLikeCount,
      estimatedShareCount: campaignContent.estimatedShareCount,
      estimatedViewCount: campaignContent.estimatedViewCount,
      externalId: campaignContent.externalId,
      engagementRate: campaignContent.engagementRate,
      id: campaignContent.id,
      isFyp: campaignContent.isFyp,
      kolDisplayName: kolProfile.displayName,
      kolId: campaignContent.kolId,
      likeCount: campaignContent.likeCount,
      metadata: campaignContent.metadata,
      platform: campaignContent.platform,
      postedAt: campaignContent.postedAt,
      shareCount: campaignContent.shareCount,
      syncErrorCode: campaignContent.syncErrorCode,
      syncMessage: campaignContent.syncMessage,
      syncStatus: campaignContent.syncStatus,
      syncedAt: campaignContent.syncedAt,
      thumbnailUrl: campaignContent.thumbnailUrl,
      title: campaignContent.title,
      updatedAt: campaignContent.updatedAt,
      viewCount: campaignContent.viewCount,
    })
    .from(campaignContent)
    .innerJoin(kolProfile, eq(campaignContent.kolId, kolProfile.id))
    .where(eq(campaignContent.id, contentId))
    .limit(1);

  if (!latest) {
    throw new ORPCError("NOT_FOUND", {
      data: { reason: "CONTENT_NOT_FOUND" },
      message: "Konten campaign tidak ditemukan.",
    });
  }

  return normalizeCampaignContentRow(
    {
      ...latest,
      metadata: (latest.metadata ?? null) as Record<string, unknown> | null,
    },
    linkMap.get(latest.kolId)?.handles ?? [],
  );
}

export async function getCampaignDetail(campaignId: number): Promise<CampaignDetailRecord | null> {
  const [item] = await db.select().from(campaign).where(eq(campaign.id, campaignId)).limit(1);

  if (!item) {
    return null;
  }

  const kols = await loadCampaignKolLinks(item.id);
  const linksByKolId = new Map(kols.map((link) => [link.id, link] as const));
  const rows = await loadCampaignContentRows(item.id, linksByKolId);

  return {
    ...item,
    contentsByKol: groupCampaignContentRows(rows, kols),
    createdAt: item.createdAt.toISOString(),
    kols,
    periodEnd: toShortDate(item.periodEnd),
    periodStart: toShortDate(item.periodStart),
    selectedKolIds: kols.map((link) => link.id),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function addCampaignContents(input: CampaignContentInput, createdByUserId: string) {
  const [item] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, input.campaignId)).limit(1);

  if (!item) {
    throw new ORPCError("NOT_FOUND", {
      data: { reason: "CAMPAIGN_NOT_FOUND" },
      message: "Campaign tidak ditemukan.",
    });
  }

  const campaignKols = await loadCampaignKolLinks(input.campaignId);

  const allowedKolIds = new Set(campaignKols.map((link) => link.id));
  const existingUrls = new Set(
    (
      await db
        .select({ contentUrl: campaignContent.contentUrl })
        .from(campaignContent)
        .where(eq(campaignContent.campaignId, input.campaignId))
    ).map((row) => row.contentUrl),
  );
  const seenUrls = new Set<string>();
  const preparedRows = [];

  for (const [index, row] of input.contents.entries()) {
    const hasUrl = Boolean(row.contentUrl?.trim());
    const content = hasUrl
      ? ensureCampaignContentUrl(index, row, existingUrls, seenUrls)
      : { contentUrl: createManualContentUrl(input.campaignId, index), platform: platformFromRow(row, null) };

    const platform = content.platform ?? platformFromRow(row, content.contentUrl);
    const contentType = contentTypeFromRow(row, hasUrl ? content.contentUrl : null);

    if (!platform) {
      throw new ORPCError("BAD_REQUEST", {
        data: { reason: "CONTENT_PLATFORM_REQUIRED" },
        message: `Baris ${index + 1}: pilih platform untuk konten manual.`,
      });
    }

    if (!contentType) {
      throw new ORPCError("BAD_REQUEST", {
        data: { reason: "CONTENT_TYPE_REQUIRED" },
        message: `Baris ${index + 1}: pilih jenis konten.`,
      });
    }

    const kolId = await ensureCampaignKolLink(
      input.campaignId,
      {
        ...row,
        contentType,
        platform,
      },
      allowedKolIds,
    );
    const defaults = await loadKolContentDefaults(kolId, contentType);

    preparedRows.push({
      ...row,
      budgetIdr: row.budgetIdr ?? defaults.budgetIdr,
      contentUrl: content.contentUrl,
      estimatedCommentCount: row.estimatedCommentCount || defaults.estimatedCommentCount,
      estimatedLikeCount: row.estimatedLikeCount || defaults.estimatedLikeCount,
      estimatedShareCount: row.estimatedShareCount || defaults.estimatedShareCount,
      estimatedViewCount: row.estimatedViewCount || defaults.estimatedViewCount,
      contentType,
      kolId,
      platform,
      shouldSync: hasUrl && contentType !== "story",
    });
  }

  const contentIdsToSync: number[] = [];

  for (const row of preparedRows) {
    const [created] = await db
      .insert(campaignContent)
      .values({
        archivedAt: null,
        authorDisplayName: "",
        authorHandle: "",
        budgetIdr: normalizeOptionalBudget(row.budgetIdr),
        campaignId: input.campaignId,
        caption: row.caption ?? "",
        commentCount: normalizeOptionalCount(row.estimatedCommentCount),
        contentType: row.contentType,
        contentUrl: row.contentUrl,
        createdByUserId,
        engagementRate: "",
        estimatedCommentCount: normalizeOptionalCount(row.estimatedCommentCount),
        estimatedLikeCount: normalizeOptionalCount(row.estimatedLikeCount),
        estimatedShareCount: normalizeOptionalCount(row.estimatedShareCount),
        estimatedViewCount: normalizeOptionalCount(row.estimatedViewCount),
        externalId: null,
        isFyp: row.isFyp ?? false,
        likeCount: normalizeOptionalCount(row.likeCount || row.estimatedLikeCount),
        kolId: row.kolId,
        metadata: null,
        platform: row.platform,
        postedAt: null,
        shareCount: normalizeOptionalCount(row.shareCount || row.estimatedShareCount),
        syncErrorCode: null,
        syncMessage: null,
        syncStatus: row.shouldSync ? "pending" : "success",
        syncedAt: row.shouldSync ? null : new Date(),
        thumbnailUrl: null,
        title: row.title ?? "",
        viewCount: normalizeOptionalCount(row.viewCount || row.estimatedViewCount),
      })
      .returning({ id: campaignContent.id });

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Gagal menyimpan konten campaign.",
      });
    }

    if (row.shouldSync) {
      contentIdsToSync.push(created.id);
    }
  }

  if (contentIdsToSync.length) {
    waitUntil(Promise.allSettled(contentIdsToSync.map((id) => syncCampaignContent(id))));
  }

  return await getCampaignDetail(input.campaignId);
}

export async function syncCampaignContent(contentId: number) {
  const content = await loadCampaignContentRow(contentId);

  await db
    .update(campaignContent)
    .set({
      syncErrorCode: null,
      syncMessage: null,
      syncStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(campaignContent.id, contentId));

  let metrics;

  try {
    metrics = await syncContentWithApify({
      platform: content.platform,
      url: content.contentUrl,
    });
  } catch (error) {
    await db
      .update(campaignContent)
      .set({
        syncErrorCode: "APIFY_UNKNOWN",
        syncMessage: error instanceof Error ? error.message : "Sinkronisasi konten gagal.",
        syncStatus: "failed",
        syncedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(campaignContent.id, contentId));

    await db.delete(campaignContent).where(eq(campaignContent.id, contentId));
    await unlinkUnusedPlaceholderKol(content.campaignId, content.kolId);

    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Sinkronisasi konten gagal.",
    });
  }

  if (metrics.syncStatus === "failed") {
    await db
      .update(campaignContent)
      .set({
        syncErrorCode: metrics.errorCode ?? null,
        syncMessage: metrics.message ?? null,
        syncStatus: "failed",
        syncedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(campaignContent.id, contentId));

    await db.delete(campaignContent).where(eq(campaignContent.id, contentId));
    await unlinkUnusedPlaceholderKol(content.campaignId, content.kolId);

    throw new ORPCError("BAD_REQUEST", {
      data: { reason: metrics.errorCode ?? "CONTENT_SYNC_FAILED" },
      message: metrics.message || "Konten gagal di-scrap.",
    });
  }

  return await updateCampaignContentMetrics(contentId, metrics);
}

export async function archiveCampaignContent(contentId: number) {
  const current = await loadCampaignContentRow(contentId);

  await db
    .update(campaignContent)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaignContent.id, contentId));

  const links = await loadCampaignKolLinks(current.campaignId);
  const linkMap = new Map(links.map((link) => [link.id, link] as const));
  const latest = await loadCampaignContentRow(contentId);

  return normalizeCampaignContentRow(
    {
      ...latest,
      metadata: (latest.metadata ?? null) as Record<string, unknown> | null,
    },
    linkMap.get(latest.kolId)?.handles ?? [],
  );
}

export async function restoreCampaignContent(contentId: number) {
  const current = await loadCampaignContentRow(contentId);

  await db
    .update(campaignContent)
    .set({
      archivedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(campaignContent.id, contentId));

  const links = await loadCampaignKolLinks(current.campaignId);
  const linkMap = new Map(links.map((link) => [link.id, link] as const));
  const latest = await loadCampaignContentRow(contentId);

  return normalizeCampaignContentRow(
    {
      ...latest,
      metadata: (latest.metadata ?? null) as Record<string, unknown> | null,
    },
    linkMap.get(latest.kolId)?.handles ?? [],
  );
}

export async function deleteCampaignContent(contentId: number) {
  const [deleted] = await db
    .delete(campaignContent)
    .where(eq(campaignContent.id, contentId))
    .returning({ id: campaignContent.id });

  if (!deleted) {
    throw new ORPCError("NOT_FOUND", {
      data: { reason: "CONTENT_NOT_FOUND" },
      message: "Konten campaign tidak ditemukan.",
    });
  }

  return { success: true };
}
