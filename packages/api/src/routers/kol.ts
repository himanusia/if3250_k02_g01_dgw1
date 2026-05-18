import { db } from "@if3250_k02_g01_dgw1/db";
import { kolAccount, kolCampaignHistory, kolProfile, kolRateCardHistory } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { ORPCError } from "@orpc/server";
import { desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import z from "zod";

import { estimateRateCard } from "../lib/rate-card-estimator";
import { syncAccountWithApify } from "../lib/apify";
import { protectedProcedure } from "../index";
import { getSettingNumber, getSetting } from "./whitelist";

const kolAccountInputSchema = z.object({
  handle: z.string().trim().min(1, "Handle tidak boleh kosong"),
  platform: z.enum(["instagram", "tiktok"]),
  profileUrl: z.string().trim().optional().default(""),
});

const kolInputSchema = z.object({
  accounts: z.array(kolAccountInputSchema).min(1, "Minimal 1 akun sosial media harus ditambahkan"),
  displayName: z.string().trim().min(1, "Nama display KOL tidak boleh kosong"),
  keywords: z.string().trim().default(""),
});

const historyInputSchema = z.object({
  brand: z.string().trim().min(1, "Nama brand tidak boleh kosong"),
  campaignName: z.string().trim().min(1, "Nama campaign tidak boleh kosong"),
  kolId: z.number().int().positive("ID KOL harus valid"),
  notes: z.string().trim().optional().default(""),
  platform: z.enum(["instagram", "tiktok"]),
  startedAt: z.string().optional().default(""),
  endedAt: z.string().optional().default(""),
});

const rateCardRangeInputSchema = z.object({
  max: z.number().int().positive("Nilai maksimal harus lebih dari 0"),
  min: z.number().int().positive("Nilai minimal harus lebih dari 0"),
  suggested: z.number().int().positive("Nilai saran harus lebih dari 0"),
}).refine(
  (data) => data.min <= data.max,
  { message: "Nilai minimal tidak boleh lebih besar dari maksimal", path: ["min"] }
);

const rateCardValueInputSchema = z.object({
  currency: z.literal("IDR"),
  post: rateCardRangeInputSchema,
  reel: rateCardRangeInputSchema,
  story: rateCardRangeInputSchema,
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

function normalizeAccountKey(account: z.infer<typeof kolAccountInputSchema>) {
  return `${account.platform}:${account.handle.trim().toLowerCase()}`;
}

async function assertAccountsAreUnique(accounts: Array<z.infer<typeof kolAccountInputSchema>>) {
  const seen = new Set<string>();

  for (const account of accounts) {
    const accountKey = normalizeAccountKey(account);

    if (seen.has(accountKey)) {
      throw new ORPCError("BAD_REQUEST", {
        data: { reason: "DUPLICATE_ACCOUNT_IN_FORM" },
        message: `Akun ${account.platform} @${account.handle} terduplikat di form.`,
      });
    }

    seen.add(accountKey);

    const existing = await db
      .select({ id: kolAccount.id })
      .from(kolAccount)
      .where(sql`LOWER(${kolAccount.handle}) = LOWER(${account.handle}) AND ${kolAccount.platform} = ${account.platform}`)
      .limit(1);

    if (existing.length > 0) {
      throw new ORPCError("BAD_REQUEST", {
        data: { reason: "DUPLICATE_ACCOUNT" },
        message: `Akun ${account.platform} @${account.handle} sudah ada. Pakai edit/sync KOL yang sudah ada, bukan create baru.`,
      });
    }
  }
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

    if (metrics.syncStatus === "pending") {
      continue;
    }

    if (metrics.syncStatus !== "success" || !hasData) {
      const errorMessage = `Akun ${account.platform} @${account.handle} tidak valid atau tidak ditemukan.`;
      const isUpstreamFailure = [
        "APIFY_BAD_REQUEST",
        "APIFY_TIMEOUT",
        "APIFY_RATE_LIMIT",
        "APIFY_UNAVAILABLE",
        "APIFY_UNKNOWN",
      ].includes(metrics.errorCode ?? "");

      if (isUpstreamFailure) {
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          data: {
            reason: metrics.errorCode ?? "APIFY_UNKNOWN",
          },
          message: "Layanan sinkronisasi akun sedang bermasalah.",
        });
      }

      throw new ORPCError("BAD_REQUEST", {
        data: {
          reason: metrics.errorCode ?? "INVALID_ACCOUNT",
        },
        message: metrics.message || errorMessage,
      });
    }
  }
}

async function syncKolProfile(kolId: number) {
  const accounts = await db.select().from(kolAccount).where(eq(kolAccount.kolId, kolId));
  const campaignHistoryRows = await db
    .select({ id: kolCampaignHistory.id })
    .from(kolCampaignHistory)
    .where(eq(kolCampaignHistory.kolId, kolId));

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
        biography: metrics.biography ?? null,
        engagementRate: metrics.engagementRate,
        externalId: metrics.externalId ?? null,
        followers: metrics.followers,
        lastSyncedAt: syncedAt,
        metadata: metrics.metadata ?? null,
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

  if (syncStatus === "success") {
    const primaryAccount = accounts.reduce((best, acc) => (acc.followers > (best?.followers ?? 0) ? acc : best), accounts[0]);
    const estimation = await estimateRateCard({
      averageLikes: totalAverageLikes,
      averageViews: totalAverageViews,
      campaignHistoryCount: campaignHistoryRows.length,
      engagementRate,
      followerTier: getFollowerTier(totalFollowers),
      platform: primaryAccount?.platform,
      platformCount: accounts.length,
      totalFollowers,
    });

    await db
      .update(kolProfile)
      .set({
        estimatedRateCard: estimation.estimatedRateCard,
        rateCardMetadata: estimation.metadata,
        updatedAt: new Date(),
      })
      .where(eq(kolProfile.id, kolId));
  }
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
  const rateCardHistory = await db
    .select()
    .from(kolRateCardHistory)
    .where(eq(kolRateCardHistory.kolId, kolId))
    .orderBy(desc(kolRateCardHistory.createdAt));

  return {
    ...profile,
    accounts: accounts.map((account) => ({
      ...account,
      createdAt: account.createdAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      metadata: account.metadata ?? null,
      updatedAt: account.updatedAt.toISOString(),
    })),
    createdAt: profile.createdAt.toISOString(),
    history: history.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      endedAt: formatDate(item.endedAt),
      startedAt: formatDate(item.startedAt),
    })),
    rateCardHistory: rateCardHistory.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    lastSyncedAt: profile.lastSyncedAt?.toISOString() ?? null,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export const kolRouter = {
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      await db.delete(kolProfile).where(eq(kolProfile.id, input.id));
      return { success: true };
    }),
  deleteHistory: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      await db.delete(kolCampaignHistory).where(eq(kolCampaignHistory.id, input.id));
      return { success: true };
    }),
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
    await assertAccountsAreUnique(input.accounts);
    await validateAccounts(input.accounts);

    const created = await db.transaction(async (tx) => {
      const [createdProfile] = await tx
        .insert(kolProfile)
        .values({
          displayName: input.displayName,
          keywords: input.keywords,
        })
        .returning({ id: kolProfile.id });

      await tx.insert(kolAccount).values(
        input.accounts.map((account) => ({
          handle: account.handle,
          kolId: createdProfile!.id,
          platform: account.platform,
          profileUrl: account.profileUrl || null,
        })),
      );

      return createdProfile!;
    });

    await syncKolProfile(created.id);
    return await mapKolRecord(created.id);
  }),
  bulkImport: protectedProcedure
  .input(z.array(kolInputSchema))
  .handler(async ({ input }) => {
    const success: Array<{
      displayName: string;
    }> = [];

    const skipped: Array<{
      displayName: string;
      reason: string;
    }> = [];

    const failed: Array<{
      displayName: string;
      reason: string;
    }> = [];

    for (const kol of input) {
      try {
        let duplicateFound = false;

        // check duplicates
        for (const account of kol.accounts) {
          const existing = await db
            .select({ id: kolAccount.id })
            .from(kolAccount)
            .where(
              sql`
                LOWER(${kolAccount.handle}) = LOWER(${account.handle})
                AND ${kolAccount.platform} = ${account.platform}
              `,
            )
            .limit(1);

          if (existing.length > 0) {
            duplicateFound = true;
            break;
          }
        }

        if (duplicateFound) {
          skipped.push({
            displayName: kol.displayName,
            reason: "Duplicate account",
          });

          continue;
        }

        // validate account
        await validateAccounts(kol.accounts);

        // create profile
        const [created] = await db
          .insert(kolProfile)
          .values({
            displayName: kol.displayName,
            keywords: kol.keywords,
          })
          .returning({
            id: kolProfile.id,
          });

        // create accounts
        await db.insert(kolAccount).values(
          kol.accounts.map((account) => ({
            handle: account.handle,
            kolId: created!.id,
            platform: account.platform,
            profileUrl:
              account.profileUrl || null,
          })),
        );

        await syncKolProfile(created!.id);

        success.push({
          displayName: kol.displayName,
        });
      } catch (error) {
        console.error(
          "[IMPORT FAILED]",
          kol.displayName,
          error,
        );

        let reason =
          "Unknown import failure";

        if (error instanceof ORPCError) {
          reason =
            error.message || reason;
        } else if (error instanceof Error) {
          reason = error.message;
        }

        failed.push({
          displayName: kol.displayName,
          reason,
        });
      }
    }

    return {
      success,
      skipped,
      failed,

      summary: {
        success: success.length,
        skipped: skipped.length,
        failed: failed.length,
        total: input.length,
      },
    };
  }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      return await mapKolRecord(input.id);
    }),
  listRateCardHistory: protectedProcedure
    .input(z.object({ kolId: z.number().int().positive() }))
    .handler(async ({ input }) => {
      const history = await db
        .select()
        .from(kolRateCardHistory)
        .where(eq(kolRateCardHistory.kolId, input.kolId))
        .orderBy(desc(kolRateCardHistory.createdAt));

      return history.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      }));
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
  updateActualRateCard: protectedProcedure
    .input(
      z.object({
        actualRateCard: rateCardValueInputSchema,
        kolId: z.number().int().positive(),
        reason: z.string().trim().optional().default(""),
      }),
    )
    .handler(async ({ context, input }) => {
      const [profile] = await db.select().from(kolProfile).where(eq(kolProfile.id, input.kolId)).limit(1);

      if (!profile) {
        throw new ORPCError("NOT_FOUND", {
          data: {
            reason: "KOL_NOT_FOUND",
          },
          message: "KOL tidak ditemukan.",
        });
      }

      await db.insert(kolRateCardHistory).values({
        changedByUserId: context.session.user.id,
        kolId: input.kolId,
        newActualRateCard: input.actualRateCard,
        oldActualRateCard: profile.actualRateCard,
        reason: input.reason || null,
      });

      await db
        .update(kolProfile)
        .set({
          actualRateCard: input.actualRateCard,
          updatedAt: new Date(),
        })
        .where(eq(kolProfile.id, input.kolId));

      return await mapKolRecord(input.kolId);
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

// global sync
export async function runGlobalSyncBatch(limit = 5) {
  const enabled = (await getSetting("kol_sync_enabled")) !== "false";

  if (!enabled) {
    console.log("[SYNC] disabled");
    return 0;
  }

  const intervalMinutes = await getSettingNumber(
    "kol_sync_interval_minutes",
    30
  );

  const cutoff = new Date(Date.now() - intervalMinutes * 60 * 1000);

  const kols = await db
    .select({ id: kolProfile.id })
    .from(kolProfile)
    .where(
      or(
        isNull(kolProfile.lastSyncedAt),
        lt(kolProfile.lastSyncedAt, cutoff)
      )
    )
    .orderBy(
      sql`COALESCE(${kolProfile.lastSyncedAt}, '1970-01-01') ASC`
    )
    .limit(limit);

  console.log(
    `[SYNC] interval=${intervalMinutes}m | selected=${kols.length}`
  );

  for (const kol of kols) {
    try {
      console.log(`[SYNC] syncing KOL ${kol.id}`);
      await syncKolProfile(kol.id);
    } catch (err) {
      console.error(`[SYNC] failed KOL ${kol.id}`, err);
    }
  }

  return kols.length;
}
