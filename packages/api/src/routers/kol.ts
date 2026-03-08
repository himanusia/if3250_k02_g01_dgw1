import { db } from "@if3250_k02_g01_dgw1/db";
import { kolAccount, kolCampaignHistory, kolProfile } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { syncAccountWithApify } from "../lib/apify";
import { protectedProcedure } from "../index";

const kolAccountInputSchema = z.object({
  handle: z.string().trim().min(1),
  platform: z.enum(["instagram", "tiktok", "shopee"]),
  profileUrl: z.string().trim().optional().default(""),
});

const kolInputSchema = z.object({
  bio: z.string().trim().default(""),
  accounts: z.array(kolAccountInputSchema).min(1),
  displayName: z.string().trim().min(1),
  keywords: z.string().trim().default(""),
});

const historyInputSchema = z.object({
  brand: z.string().trim().min(1),
  campaignName: z.string().trim().min(1),
  kolId: z.number().int().positive(),
  notes: z.string().trim().optional().default(""),
  platform: z.enum(["instagram", "tiktok", "shopee"]),
  startedAt: z.string().optional().default(""),
  endedAt: z.string().optional().default(""),
});

function toNullableDate(value?: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T00:00:00`);
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function getFollowerTier(totalFollowers: number) {
  if (totalFollowers >= 1_000_000) {
    return "mega" as const;
  }

  if (totalFollowers >= 100_000) {
    return "macro" as const;
  }

  if (totalFollowers >= 10_000) {
    return "micro" as const;
  }

  return "nano" as const;
}

async function validateAccounts(accounts: Array<z.infer<typeof kolAccountInputSchema>>) {
  for (const account of accounts) {
    const metrics = await syncAccountWithApify({
      handle: account.handle,
      platform: account.platform,
      profileUrl: account.profileUrl,
    });

    const hasData =
      metrics.followers > 0 ||
      metrics.averageLikes > 0 ||
      metrics.averageViews > 0 ||
      Boolean(metrics.externalId);

    if (metrics.syncStatus !== "success" || !hasData) {
      throw new Error(`Akun ${account.platform} @${account.handle} tidak valid atau data tidak ditemukan.`);
    }
  }
}

async function validateAccounts(accounts: Array<z.infer<typeof kolAccountInputSchema>>) {
    await validateAccounts(input.accounts);

  for (const account of accounts) {
    const metrics = await syncAccountWithApify({
      handle: account.handle,
      platform: account.platform,
      profileUrl: account.profileUrl,

    const hasData =
      metrics.followers > 0 ||
      metrics.averageLikes > 0 ||
      metrics.averageViews > 0 ||
      Boolean(metrics.externalId);

    if (metrics.syncStatus !== "success" || !hasData) {
      throw new Error(`Akun ${account.platform} @${account.handle} tidak valid atau data tidak ditemukan.`);
    }
  }
}

async function syncKolProfile(kolId: number) {
  const accounts = await db.select().from(kolAccount).where(eq(kolAccount.kolId, kolId));

  let totalFollowers = 0;
  let totalAverageLikes = 0;
  let totalAverageViews = 0;
  let numericEngagementSum = 0;
  let numericEngagementCount = 0;
  let hasFailed = false;
  let hasPending = false;
  let latestMessage: string | null = null;
  let lastSyncedAt: Date | null = null;

  for (const account of accounts) {
    const metrics = await syncAccountWithApify({
      handle: account.handle,
      platform: account.platform,
      profileUrl: account.profileUrl,
    });

    const syncedAt = metrics.syncStatus === "success" ? new Date() : null;

    await db
      .update(kolAccount)
      .set({
        averageLikes: metrics.averageLikes,
        averageViews: metrics.averageViews,
        engagementRate: metrics.engagementRate,
        externalId: metrics.externalId ?? null,
        followers: metrics.followers,
        lastSyncedAt: syncedAt,
        syncMessage: metrics.message ?? null,
        syncStatus: metrics.syncStatus,
        updatedAt: new Date(),
      })
      .where(eq(kolAccount.id, account.id));

    totalFollowers += metrics.followers;
    totalAverageLikes += metrics.averageLikes;
    totalAverageViews += metrics.averageViews;

    const engagementNumber = Number(metrics.engagementRate.replace(/[^\d.-]/g, ""));

    if (Number.isFinite(engagementNumber) && engagementNumber > 0) {
      numericEngagementSum += engagementNumber;
      numericEngagementCount += 1;
    }

    if (metrics.syncStatus === "failed") {
      hasFailed = true;
      latestMessage = metrics.message ?? latestMessage;
    }

    if (metrics.syncStatus === "pending") {
      hasPending = true;
      latestMessage = metrics.message ?? latestMessage;
    }

    if (syncedAt && (!lastSyncedAt || syncedAt > lastSyncedAt)) {
      lastSyncedAt = syncedAt;
    }
  }

  const syncStatus = hasFailed ? "failed" : hasPending ? "pending" : "success";
  const engagementRate = numericEngagementCount
    ? `${(numericEngagementSum / numericEngagementCount).toFixed(2)}%`
    : "";

  await db
    .update(kolProfile)
    .set({
      averageLikes: totalAverageLikes,
      averageViews: totalAverageViews,
      engagementRate,
      followerTier: getFollowerTier(totalFollowers),
      lastSyncedAt,
      syncMessage: latestMessage,
      syncStatus,
      totalFollowers,
      updatedAt: new Date(),
    })
    .where(eq(kolProfile.id, kolId));
}

async function mapKolRecord(kolId: number) {
  const [profile] = await db.select().from(kolProfile).where(eq(kolProfile.id, kolId)).limit(1);

  if (!profile) {
    return null;
  }

  const accounts = await db
    .select()
    .from(kolAccount)
    .where(eq(kolAccount.kolId, kolId))
    .orderBy(desc(kolAccount.createdAt));
  const history = await db
    .select()
    .from(kolCampaignHistory)
    .where(eq(kolCampaignHistory.kolId, kolId))
    .orderBy(desc(kolCampaignHistory.createdAt));

  return {
    ...profile,
    accounts: accounts.map((account) => ({
      ...account,
      createdAt: account.createdAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      updatedAt: account.updatedAt.toISOString(),
    })),
    createdAt: profile.createdAt.toISOString(),
      await validateAccounts(input.accounts);

    history: history.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      endedAt: formatDate(item.endedAt),
      startedAt: formatDate(item.startedAt),
    lastSyncedAt: profile.lastSyncedAt?.toISOString() ?? null,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export const kolRouter = {
  addHistory: protectedProcedure.input(historyInputSchema).handler(async ({ input }) => {
    const [created] = await db
      .insert(kolCampaignHistory)
      .values({
        brand: input.brand,
        campaignName: input.campaignName,
        kolId: input.kolId,
        notes: input.notes,
        platform: input.platform,
        endedAt: toNullableDate(input.endedAt),
        startedAt: toNullableDate(input.startedAt),
      })
      .returning();

    return {
      ...created,
      createdAt: created!.createdAt.toISOString(),
      endedAt: formatDate(created!.endedAt),
      startedAt: formatDate(created!.startedAt),
    };
  }),
  create: protectedProcedure.input(kolInputSchema).handler(async ({ input }) => {
    await validateAccounts(input.accounts);

    const [created] = await db
      .insert(kolProfile)
      .values({
        bio: input.bio,
        displayName: input.displayName,
        keywords: input.keywords,
      })
      .returning({ id: kolProfile.id });

    await db.insert(kolAccount).values(
      input.accounts.map((account) => ({
        handle: account.handle,
        kolId: created!.id,
        platform: account.platform,
        profileUrl: account.profileUrl || null,
      })),
    );

    await syncKolProfile(created!.id);

    return await mapKolRecord(created!.id);
  }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await mapKolRecord(input.id);
    }),
  list: protectedProcedure.handler(async () => {
    const rows = await db.select({ id: kolProfile.id }).from(kolProfile).orderBy(desc(kolProfile.createdAt));

    return await Promise.all(rows.map((row) => mapKolRecord(row.id)));
  }),
  syncMetrics: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      await syncKolProfile(input.id);
      return await mapKolRecord(input.id);
    }),
  update: protectedProcedure
    .input(
      kolInputSchema.extend({
        id: z.number().int().positive(),
      }),
    )
    .handler(async ({ input }) => {
      await validateAccounts(input.accounts);

      await db
        .update(kolProfile)
        .set({
          bio: input.bio,
          displayName: input.displayName,
          keywords: input.keywords,
          updatedAt: new Date(),
        })
        .where(eq(kolProfile.id, input.id));

      const existingAccounts = await db.select().from(kolAccount).where(eq(kolAccount.kolId, input.id));

      for (const account of existingAccounts) {
        await db.delete(kolAccount).where(eq(kolAccount.id, account.id));
      }

      await db.insert(kolAccount).values(
        input.accounts.map((account) => ({
          handle: account.handle,
          kolId: input.id,
          platform: account.platform,
          profileUrl: account.profileUrl || null,
        })),
      );

      await syncKolProfile(input.id);
      return await mapKolRecord(input.id);
    }),
};
