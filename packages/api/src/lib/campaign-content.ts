import { db } from "@if3250_k02_g01_dgw1/db";
import { campaign, campaignContent, campaignKol } from "@if3250_k02_g01_dgw1/db/schema/campaign";
import { kolAccount, kolProfile, type SocialPlatform } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";

import { syncContentWithApify } from "./apify";

export type CampaignKolLink = {
  campaignId: number;
  displayName: string;
  handles: string[];
  id: number;
};

export type CampaignContentRecord = {
  authorDisplayName: string;
  authorHandle: string;
  campaignId: number;
  caption: string;
  commentCount: number;
  contentUrl: string;
  createdAt: string;
  externalId: string | null;
  engagementRate: string;
  id: number;
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
  contents: CampaignContentRecord[];
  displayName: string;
  handles: string[];
  kolId: number;
};

export type CampaignDetailRecord = {
  brand: string;
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
  targetFollowerTier: string;
  targetKolCount: number;
  updatedAt: string;
};

type CampaignContentInputRow = {
  contentUrl: string;
  kolId: number;
};

type CampaignContentInput = {
  campaignId: number;
  contents: CampaignContentInputRow[];
};

type CampaignContentRow = {
  authorDisplayName: string;
  authorHandle: string;
  campaignId: number;
  caption: string;
  commentCount: number;
  contentUrl: string;
  createdAt: Date;
  externalId: string | null;
  engagementRate: string;
  id: number;
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

function normalizeCampaignContentRow(row: CampaignContentRow, handles: string[]): CampaignContentRecord {
  return {
    authorDisplayName: row.authorDisplayName,
    authorHandle: row.authorHandle,
    campaignId: row.campaignId,
    caption: row.caption,
    commentCount: row.commentCount,
    contentUrl: row.contentUrl,
    createdAt: row.createdAt.toISOString(),
    externalId: row.externalId,
    engagementRate: row.engagementRate,
    id: row.id,
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
      displayName: row.displayName,
      handles: [],
      id: row.kolId,
    };

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
      authorDisplayName: campaignContent.authorDisplayName,
      authorHandle: campaignContent.authorHandle,
      campaignId: campaignContent.campaignId,
      caption: campaignContent.caption,
      commentCount: campaignContent.commentCount,
      contentUrl: campaignContent.contentUrl,
      createdAt: campaignContent.createdAt,
      externalId: campaignContent.externalId,
      engagementRate: campaignContent.engagementRate,
      id: campaignContent.id,
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

function ensureCampaignContentUrl(rowIndex: number, row: CampaignContentInputRow, existingUrls: Set<string>, seenUrls: Set<string>) {
  const normalizedUrl = normalizeContentUrl(row.contentUrl);

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

async function loadCampaignContentRow(contentId: number) {
  const [row] = await db
    .select({
      authorDisplayName: campaignContent.authorDisplayName,
      authorHandle: campaignContent.authorHandle,
      campaignId: campaignContent.campaignId,
      caption: campaignContent.caption,
      commentCount: campaignContent.commentCount,
      contentUrl: campaignContent.contentUrl,
      createdAt: campaignContent.createdAt,
      externalId: campaignContent.externalId,
      engagementRate: campaignContent.engagementRate,
      id: campaignContent.id,
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
    await db
      .update(campaignContent)
      .set({
        authorDisplayName: metrics.authorDisplayName,
        authorHandle: metrics.authorHandle,
        caption: metrics.caption,
        commentCount: metrics.commentCount,
        engagementRate: metrics.engagementRate,
        externalId: metrics.externalId,
        likeCount: metrics.likeCount,
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
      authorDisplayName: campaignContent.authorDisplayName,
      authorHandle: campaignContent.authorHandle,
      campaignId: campaignContent.campaignId,
      caption: campaignContent.caption,
      commentCount: campaignContent.commentCount,
      contentUrl: campaignContent.contentUrl,
      createdAt: campaignContent.createdAt,
      externalId: campaignContent.externalId,
      engagementRate: campaignContent.engagementRate,
      id: campaignContent.id,
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

  if (!campaignKols.length) {
    throw new ORPCError("BAD_REQUEST", {
      data: { reason: "CAMPAIGN_HAS_NO_KOL" },
      message: "Campaign ini belum punya KOL. Tambahkan KOL terlebih dahulu.",
    });
  }

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
  const preparedRows = input.contents.map((row, index) => {
    if (!allowedKolIds.has(row.kolId)) {
      throw new ORPCError("BAD_REQUEST", {
        data: { reason: "KOL_NOT_IN_CAMPAIGN" },
        message: `Baris ${index + 1}: KOL tidak termasuk di campaign ini.`,
      });
    }

    const content = ensureCampaignContentUrl(index, row, existingUrls, seenUrls);

    return {
      contentUrl: content.contentUrl,
      kolId: row.kolId,
      platform: content.platform,
    };
  });

  for (const row of preparedRows) {
    const [created] = await db
      .insert(campaignContent)
      .values({
        authorDisplayName: "",
        authorHandle: "",
        campaignId: input.campaignId,
        caption: "",
        commentCount: 0,
        contentUrl: row.contentUrl,
        createdByUserId,
        engagementRate: "",
        likeCount: 0,
        kolId: row.kolId,
        metadata: null,
        platform: row.platform,
        shareCount: 0,
        syncStatus: "pending",
        title: "",
        viewCount: 0,
      })
      .returning({ id: campaignContent.id });

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Gagal menyimpan konten campaign.",
      });
    }

    await syncCampaignContent(created.id);
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

    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Sinkronisasi konten gagal.",
    });
  }

  return await updateCampaignContentMetrics(contentId, metrics);
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