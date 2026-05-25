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
        kolId: z.number().int().positive(),
        contentUrl: z.string().trim().min(1, "Link konten wajib diisi."),
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
      platform: kolAccount.platform,
    })
    .from(campaignKol)
    .innerJoin(kolProfile, eq(campaignKol.kolId, kolProfile.id))
    .leftJoin(kolAccount, eq(kolAccount.kolId, kolProfile.id));

  const grouped = new Map<
    string,
    { campaignId: number; displayName: string; handles: string[]; id: number }
  >();

  for (const row of rows) {
    const key = `${row.campaignId}:${row.kolId}`;
    const current = grouped.get(key) ?? {
      campaignId: row.campaignId,
      displayName: row.displayName,
      handles: [],
      id: row.kolId,
    };

    if (row.handle && !current.handles.includes(`${row.platform}:${row.handle}`)) {
      current.handles.push(`${row.platform}:${row.handle}`);
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
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
      const lastSyncedAt = successfulSyncs.reduce<Date | null>((latest, row) => {
        if (!row.syncedAt) {
          return latest;
        }

        return !latest || row.syncedAt > latest ? row.syncedAt : latest;
      }, null);
      const lastScrapedAt = campaignContents.reduce<Date | null>((latest, row) => {
        const candidate = row.syncedAt ?? row.updatedAt;
        return !latest || candidate > latest ? candidate : latest;
      }, null);

      return {
        brand: item.brand,
        commentCount: campaignContents.reduce((sum, row) => sum + row.commentCount, 0),
        contentCount: campaignContents.length,
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
