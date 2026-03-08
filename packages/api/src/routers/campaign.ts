import { db } from "@if3250_k02_g01_dgw1/db";
import { campaign, campaignKol } from "@if3250_k02_g01_dgw1/db/schema/campaign";
import { kolProfile } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

const campaignInputSchema = z.object({
  brand: z.string().trim().min(1),
  description: z.string().trim().min(1),
  keywords: z.string().trim().default(""),
  kolCategory: z.string().trim().default(""),
  kolTargetCount: z.number().int().nonnegative(),
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  periodEnd: z.string().min(1),
  periodStart: z.string().min(1),
  postBriefs: z.string().trim().default(""),
  selectedKolIds: z.array(z.number().int().positive()).default([]),
  status: z.enum(["draft", "active", "completed", "archived"]),
});

function toDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

async function replaceCampaignKols(campaignId: number, kolIds: number[]) {
  await db.delete(campaignKol).where(eq(campaignKol.campaignId, campaignId));

  if (!kolIds.length) {
    return;
  }

  await db.insert(campaignKol).values(kolIds.map((kolId) => ({ campaignId, kolId })));
}

export const campaignRouter = {
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
  create: protectedProcedure.input(campaignInputSchema).handler(async ({ context, input }) => {
    const result = await db
      .insert(campaign)
      .values({
        brand: input.brand,
        createdByUserId: context.session.user.id,
        description: input.description,
        keywords: input.keywords,
        kolCategory: input.kolCategory,
        kolTargetCount: input.kolTargetCount,
        name: input.name,
        objective: input.objective,
        periodEnd: toDate(input.periodEnd),
        periodStart: toDate(input.periodStart),
        postBriefs: input.postBriefs,
        status: input.status,
      })
      .returning({ id: campaign.id });

    const created = result[0]!;

    await replaceCampaignKols(created.id, input.selectedKolIds);

    return { id: created.id };
  }),
  list: protectedProcedure.handler(async () => {
    const campaigns = await db.select().from(campaign).orderBy(desc(campaign.createdAt));
    const links = await db
      .select({
        campaignId: campaignKol.campaignId,
        kolId: kolProfile.id,
        displayName: kolProfile.displayName,
        username: kolProfile.username,
      })
      .from(campaignKol)
      .innerJoin(kolProfile, eq(campaignKol.kolId, kolProfile.id));

    return campaigns.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      kols: links
        .filter((link) => link.campaignId === item.id)
        .map((link) => ({
          displayName: link.displayName,
          id: link.kolId,
          username: link.username,
        })),
      periodEnd: item.periodEnd.toISOString().slice(0, 10),
      periodStart: item.periodStart.toISOString().slice(0, 10),
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
      await db
        .update(campaign)
        .set({
          brand: input.brand,
          description: input.description,
          keywords: input.keywords,
          kolCategory: input.kolCategory,
          kolTargetCount: input.kolTargetCount,
          name: input.name,
          objective: input.objective,
          periodEnd: toDate(input.periodEnd),
          periodStart: toDate(input.periodStart),
          postBriefs: input.postBriefs,
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(campaign.id, input.id));

      await replaceCampaignKols(input.id, input.selectedKolIds);

      return { id: input.id };
    }),
};
