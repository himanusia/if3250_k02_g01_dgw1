import { db } from "@if3250_k02_g01_dgw1/db";
import { whitelistEmail } from "@if3250_k02_g01_dgw1/db/schema/whitelist";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { getSetting, getSettingNumber, setSetting } from "../lib/app-settings";
import {
  DEFAULT_RATE_CARD_FORMULA_SETTINGS,
  getRateCardFormulaSettings,
  type RateCardFormulaSettings,
} from "../lib/rate-card-estimator";

const whitelistInputSchema = z.object({
  email: z.email(),
  note: z.string().trim().max(500).optional().default(""),
  role: z.enum(["admin", "user"]),
});

const formulaSettingsSchema = z.object({
  campaignHistoryBonus: z.number().min(0).max(1),
  engagementRateIdr: z.number().int().min(0),
  followerRateIdr: z.number().min(0),
  instagramMultiplier: z.number().min(0.1).max(5),
  macroTierMultiplier: z.number().min(0.1).max(5),
  maxCampaignHistoryBonus: z.number().min(0).max(2),
  maxMultiPlatformBonus: z.number().min(0).max(2),
  megaTierMultiplier: z.number().min(0.1).max(5),
  microTierMultiplier: z.number().min(0.1).max(5),
  minimumRateIdr: z.number().int().min(0),
  multiPlatformBonus: z.number().min(0).max(1),
  nanoTierMultiplier: z.number().min(0.1).max(5),
  rangeSpread: z.number().min(0).max(0.9),
  reelMultiplier: z.number().min(0.1).max(10),
  storyMultiplier: z.number().min(0.1).max(10),
  tiktokMultiplier: z.number().min(0.1).max(5),
  viewCpmIdr: z.number().int().min(0),
}) satisfies z.ZodType<RateCardFormulaSettings>;

export const whitelistRouter = {
  create: protectedProcedure.input(whitelistInputSchema).handler(async ({ context, input }) => {
    if (context.whitelist.role !== "admin") {
      throw new ORPCError("FORBIDDEN");
    }

    const result = await db
      .insert(whitelistEmail)
      .values({
        createdByUserId: context.session.user.id,
        email: input.email.trim().toLowerCase(),
        note: input.note,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: whitelistEmail.email,
        set: {
          isActive: true,
          note: input.note,
          role: input.role,
          updatedAt: new Date(),
        },
      })
      .returning();

    const created = result[0]!;

    return {
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(async ({ context, input }) => {
      if (context.whitelist.role !== "admin") {
        throw new ORPCError("FORBIDDEN");
      }

      await db.delete(whitelistEmail).where(eq(whitelistEmail.id, input.id));

      return {
        success: true,
      };
    }),
  list: protectedProcedure.handler(async ({ context }) => {
    if (context.whitelist.role !== "admin") {
      throw new ORPCError("FORBIDDEN");
    }

    const rows = await db.select().from(whitelistEmail).orderBy(desc(whitelistEmail.createdAt));

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }),

  getSyncSettings: protectedProcedure.handler(async () => {
    const interval = await getSettingNumber("kol_sync_interval_minutes", 1_440);
    const enabled = (await getSetting("kol_sync_enabled")) !== "false";

    return {
      intervalMinutes: interval,
      enabled,
    };
  }),

  updateSyncSettings: protectedProcedure
    .input(
      z.object({
        intervalMinutes: z.number().int().positive(),
        enabled: z.boolean(),
      })
    )
    .handler(async ({ input }) => {
      await db
        .insert(appSettings)
        .values({
          key: "kol_sync_interval_minutes",
          value: String(input.intervalMinutes),
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: String(input.intervalMinutes) },
        });

      await db
        .insert(appSettings)
        .values({
          key: "kol_sync_enabled",
          value: String(input.enabled),
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: String(input.enabled) },
        });

      return { success: true };
    }),

  getRateCardFormulaSettings: protectedProcedure.handler(async ({ context }) => {
    if (context.whitelist.role !== "admin") {
      throw new ORPCError("FORBIDDEN");
    }

    return await getRateCardFormulaSettings();
  }),

  resetRateCardFormulaSettings: protectedProcedure.handler(async ({ context }) => {
    if (context.whitelist.role !== "admin") {
      throw new ORPCError("FORBIDDEN");
    }

    await setSetting("rate_card_formula_settings", JSON.stringify(DEFAULT_RATE_CARD_FORMULA_SETTINGS));
    return DEFAULT_RATE_CARD_FORMULA_SETTINGS;
  }),

  updateRateCardFormulaSettings: protectedProcedure
    .input(formulaSettingsSchema)
    .handler(async ({ context, input }) => {
      if (context.whitelist.role !== "admin") {
        throw new ORPCError("FORBIDDEN");
      }

      await setSetting("rate_card_formula_settings", JSON.stringify(input));
      return input;
    }),
};
