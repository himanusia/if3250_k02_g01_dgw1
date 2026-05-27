import { db } from "@if3250_k02_g01_dgw1/db";
import { campaign, campaignContent, campaignKol } from "@if3250_k02_g01_dgw1/db/schema/campaign";
import { kolAccount, kolProfile } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { and, desc, eq, isNull } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import {
  addCampaignContents,
  archiveCampaignContent,
  deleteCampaignContent,
  getCampaignDetail,
  restoreCampaignContent,
  syncCampaignContent,
} from "../lib/campaign-content";

const campaignInputSchema = z.object({
  brand: z.string().trim().min(1),
  description: z.string().trim().min(1),
  keywords: z.string().trim().default(""),
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  periodEnd: z.string().min(1),
  periodStart: z.string().min(1),
  postBriefs: z.string().trim().default(""),
  selectedKolIds: z.array(z.number().int().positive()).default([]),
  status: z.enum(["draft", "active", "completed", "archived"]),
  targetFollowerTier: z.string().trim().default(""),
  targetKolCount: z.number().int().nonnegative(),
});

const campaignContentInputSchema = z.object({
  campaignId: z.number().int().positive(),
  contents: z
    .array(
      z.object({
        budgetIdr: z.number().int().nonnegative().nullable().optional(),
        caption: z.string().trim().optional().default(""),
        contentType: z.enum(["post", "reel", "story"]).default("post"),
        contentUrl: z.string().trim().optional().default(""),
        estimatedCommentCount: z.number().int().nonnegative().optional().default(0),
        estimatedLikeCount: z.number().int().nonnegative().optional().default(0),
        estimatedShareCount: z.number().int().nonnegative().optional().default(0),
        estimatedViewCount: z.number().int().nonnegative().optional().default(0),
        isFyp: z.boolean().nullable().optional(),
        kolDisplayName: z.string().trim().optional().default(""),
        kolHandle: z.string().trim().optional().default(""),
        kolId: z.number().int().positive().nullable().optional(),
        likeCount: z.number().int().nonnegative().optional().default(0),
        platform: z.enum(["instagram", "tiktok"]).optional(),
        shareCount: z.number().int().nonnegative().optional().default(0),
        title: z.string().trim().optional().default(""),
        viewCount: z.number().int().nonnegative().optional().default(0),
      }),
    )
    .min(1, "Minimal 1 konten harus diisi."),
});

type CampaignDb = Pick<typeof db, "delete" | "insert">;

function toDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

async function replaceCampaignKols(database: CampaignDb, campaignId: number, kolIds: number[]) {
  await database.delete(campaignKol).where(eq(campaignKol.campaignId, campaignId));

  if (!kolIds.length) {
    return;
  }

  await database.insert(campaignKol).values(kolIds.map((kolId) => ({ campaignId, kolId })));
}

async function getCampaignKolLinks() {
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
    .leftJoin(kolAccount, eq(kolAccount.kolId, kolProfile.id));

  const grouped = new Map<
    string,
    { avatarUrl: string | null; campaignId: number; displayName: string; handles: string[]; id: number }
  >();

  for (const row of rows) {
    const key = `${row.campaignId}:${row.kolId}`;
    const current = grouped.get(key) ?? {
      avatarUrl: null,
      campaignId: row.campaignId,
      displayName: row.displayName,
      handles: [],
      id: row.kolId,
    };

    current.avatarUrl ??= getAccountAvatarUrl((row.metadata ?? null) as Record<string, unknown> | null);

    if (row.handle && !current.handles.includes(`${row.platform}:${row.handle}`)) {
      current.handles.push(`${row.platform}:${row.handle}`);
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
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

export const campaignRouter = {
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      await db.delete(campaign).where(eq(campaign.id, input.id));
      return { success: true };
    }),
  dashboard: protectedProcedure.handler(async () => {
    const campaigns = await db.select().from(campaign).orderBy(desc(campaign.updatedAt));
    const links = await getCampaignKolLinks();
    const contentRows = await db
      .select({
        campaignId: campaignContent.campaignId,
        commentCount: campaignContent.commentCount,
        contentType: campaignContent.contentType,
        budgetIdr: campaignContent.budgetIdr,
        estimatedCommentCount: campaignContent.estimatedCommentCount,
        estimatedLikeCount: campaignContent.estimatedLikeCount,
        estimatedShareCount: campaignContent.estimatedShareCount,
        estimatedViewCount: campaignContent.estimatedViewCount,
        likeCount: campaignContent.likeCount,
        shareCount: campaignContent.shareCount,
        syncStatus: campaignContent.syncStatus,
        syncedAt: campaignContent.syncedAt,
        updatedAt: campaignContent.updatedAt,
        viewCount: campaignContent.viewCount,
      })
      .from(campaignContent)
      .where(isNull(campaignContent.archivedAt));

    return campaigns.map((item) => {
      const campaignContents = contentRows.filter((row) => row.campaignId === item.id);
      const successfulSyncs = campaignContents.filter((row) => row.syncStatus === "success");
      const lastSyncedAt = successfulSyncs.reduce<Date | null>((oldest, row) => {
        if (!row.syncedAt) {
          return oldest;
        }

        return !oldest || row.syncedAt < oldest ? row.syncedAt : oldest;
      }, null);
      const lastScrapedAt = campaignContents.reduce<Date | null>((latest, row) => {
        const candidate = row.syncedAt ?? row.updatedAt;
        return !latest || candidate > latest ? candidate : latest;
      }, null);

      return {
        brand: item.brand,
        commentCount: campaignContents.reduce((sum, row) => sum + row.commentCount, 0),
        budgetUsedIdr: campaignContents.reduce((sum, row) => sum + (row.budgetIdr ?? 0), 0),
        contentCount: campaignContents.length,
        postCount: campaignContents.filter((row) => row.contentType === "post").length,
        reelCount: campaignContents.filter((row) => row.contentType === "reel").length,
        storyCount: campaignContents.filter((row) => row.contentType === "story").length,
        estimatedCommentCount: campaignContents.reduce((sum, row) => sum + row.estimatedCommentCount, 0),
        estimatedLikeCount: campaignContents.reduce((sum, row) => sum + row.estimatedLikeCount, 0),
        estimatedShareCount: campaignContents.reduce((sum, row) => sum + row.estimatedShareCount, 0),
        estimatedViewCount: campaignContents.reduce((sum, row) => sum + row.estimatedViewCount, 0),
        createdAt: item.createdAt.toISOString(),
        failedSyncCount: campaignContents.filter((row) => row.syncStatus === "failed").length,
        id: item.id,
        kolCount: new Set(links.filter((link) => link.campaignId === item.id).map((link) => link.id)).size,
        lastScrapedAt: lastScrapedAt?.toISOString() ?? null,
        lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
        likeCount: campaignContents.reduce((sum, row) => sum + row.likeCount, 0),
        name: item.name,
        objective: item.objective,
        pendingSyncCount: campaignContents.filter((row) => row.syncStatus === "pending").length,
        periodEnd: item.periodEnd.toISOString().slice(0, 10),
        periodStart: item.periodStart.toISOString().slice(0, 10),
        shareCount: campaignContents.reduce((sum, row) => sum + row.shareCount, 0),
        status: item.status,
        syncedContentCount: successfulSyncs.length,
        targetFollowerTier: item.targetFollowerTier,
        targetKolCount: item.targetKolCount,
        updatedAt: item.updatedAt.toISOString(),
        viewCount: campaignContents.reduce((sum, row) => sum + row.viewCount, 0),
      };
    });
  }),
  addKolToCampaign: protectedProcedure
    .input(
      z.object({
        campaignId: z.number().int().positive(),
        kolId: z.number().int().positive(),
      }),
    )
    .handler(async ({ input }) => {
      const [existingLink] = await db
        .select({ id: campaignKol.id })
        .from(campaignKol)
        .where(and(eq(campaignKol.campaignId, input.campaignId), eq(campaignKol.kolId, input.kolId)))
        .limit(1);

      if (!existingLink) {
        await db.insert(campaignKol).values(input);
      }

      return { success: true };
    }),
  addContent: protectedProcedure.input(campaignContentInputSchema).handler(async ({ context, input }) => {
    return await addCampaignContents(input, context.session.user.id);
  }),
  archiveContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await archiveCampaignContent(input.id);
    }),
  syncActiveContent: protectedProcedure.handler(async () => {
    const rows = await db
      .select({ id: campaignContent.id })
      .from(campaignContent)
      .innerJoin(campaign, eq(campaignContent.campaignId, campaign.id))
      .where(and(eq(campaign.status, "active"), isNull(campaignContent.archivedAt)));

    let failed = 0;

    for (const row of rows) {
      try {
        await syncCampaignContent(row.id);
      } catch {
        failed += 1;
      }
    }

    return {
      failed,
      synced: rows.length - failed,
      total: rows.length,
    };
  }),
  create: protectedProcedure.input(campaignInputSchema).handler(async ({ context, input }) => {
    const created = await db.transaction(async (tx) => {
      const result = await tx
        .insert(campaign)
        .values({
          brand: input.brand,
          createdByUserId: context.session.user.id,
          description: input.description,
          keywords: input.keywords,
          name: input.name,
          objective: input.objective,
          periodEnd: toDate(input.periodEnd),
          periodStart: toDate(input.periodStart),
          postBriefs: input.postBriefs,
          status: input.status,
          targetFollowerTier: input.targetFollowerTier,
          targetKolCount: input.targetKolCount,
        })
        .returning({ id: campaign.id });

      const createdCampaign = result[0]!;

      await replaceCampaignKols(tx, createdCampaign.id, input.selectedKolIds);

      return createdCampaign;
    });

    return { id: created.id };
  }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await getCampaignDetail(input.id);
    }),
  list: protectedProcedure.handler(async () => {
    const campaigns = await db.select().from(campaign).orderBy(desc(campaign.createdAt));
    const links = await getCampaignKolLinks();

    return campaigns.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      kols: links
        .filter((link) => link.campaignId === item.id)
        .map((link) => ({
          avatarUrl: link.avatarUrl,
          displayName: link.displayName,
          handles: link.handles,
          id: link.id,
        })),
      periodEnd: item.periodEnd.toISOString().slice(0, 10),
      periodStart: item.periodStart.toISOString().slice(0, 10),
      selectedKolIds: links.filter((link) => link.campaignId === item.id).map((link) => link.id),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }),
  update: protectedProcedure
    .input(
      campaignInputSchema.extend({
        id: z.number().int().positive(),
      }),
    )
    .handler(async ({ input }) => {
      await db.transaction(async (tx) => {
        await tx
          .update(campaign)
          .set({
            brand: input.brand,
            description: input.description,
            keywords: input.keywords,
            name: input.name,
            objective: input.objective,
            periodEnd: toDate(input.periodEnd),
            periodStart: toDate(input.periodStart),
            postBriefs: input.postBriefs,
            status: input.status,
            targetFollowerTier: input.targetFollowerTier,
            targetKolCount: input.targetKolCount,
            updatedAt: new Date(),
          })
          .where(eq(campaign.id, input.id));

        await replaceCampaignKols(tx, input.id, input.selectedKolIds);
      });

      return { id: input.id };
    }),
  deleteContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await deleteCampaignContent(input.id);
    }),
  restoreContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await restoreCampaignContent(input.id);
    }),
  syncContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await syncCampaignContent(input.id);
    }),
};
