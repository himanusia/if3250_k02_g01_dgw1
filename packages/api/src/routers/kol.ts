import { db } from "@if3250_k02_g01_dgw1/db";
import { kolProfile } from "@if3250_k02_g01_dgw1/db/schema/kol";
import { desc } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

const kolInputSchema = z.object({
  analyticsNotes: z.string().trim().default(""),
  averageLikes: z.number().int().nonnegative(),
  averageViews: z.number().int().nonnegative(),
  bio: z.string().trim().default(""),
  campaignHistory: z.string().trim().default(""),
  category: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  engagementRate: z.string().trim().default(""),
  estimatedRateCard: z.number().int().nonnegative(),
  fieldOfExpertise: z.string().trim().min(1),
  followers: z.number().int().nonnegative(),
  keywords: z.string().trim().default(""),
  platformLinks: z.string().trim().default(""),
  primaryPlatform: z.enum(["tiktok", "instagram", "youtube", "shopee", "other"]),
  salesNotes: z.string().trim().default(""),
  username: z.string().trim().min(1),
});

export const kolRouter = {
  create: protectedProcedure.input(kolInputSchema).handler(async ({ input }) => {
    const result = await db.insert(kolProfile).values(input).returning();
    const created = result[0]!;

    return {
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }),
  list: protectedProcedure.handler(async () => {
    const rows = await db.select().from(kolProfile).orderBy(desc(kolProfile.createdAt));

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }),
};
