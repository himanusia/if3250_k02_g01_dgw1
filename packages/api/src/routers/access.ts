import { db } from "@if3250_k02_g01_dgw1/db";
import { allowedEmail, appSettings } from "@if3250_k02_g01_dgw1/db/schema/access";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

const accessInputSchema = z.object({
  email: z.email(),
  note: z.string().trim().max(500).optional().default(""),
  role: z.enum(["admin", "user"]),
});

export const accessRouter = {
  create: protectedProcedure.input(accessInputSchema).handler(async ({ context, input }) => {
    if (context.access.role !== "admin") {
      throw new ORPCError("FORBIDDEN");
    }

    const result = await db
      .insert(allowedEmail)
      .values({
        createdByUserId: context.session.user.id,
        email: input.email.trim().toLowerCase(),
        note: input.note,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: allowedEmail.email,
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
      if (context.access.role !== "admin") {
        throw new ORPCError("FORBIDDEN");
      }

      await db.delete(allowedEmail).where(eq(allowedEmail.id, input.id));

      return {
        success: true,
      };
    }),
  list: protectedProcedure.handler(async ({ context }) => {
    if (context.access.role !== "admin") {
      throw new ORPCError("FORBIDDEN");
    }

    const rows = await db.select().from(allowedEmail).orderBy(desc(allowedEmail.createdAt));

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }),

  getSyncSettings: protectedProcedure.handler(async () => {
    const interval = await getSettingNumber("kol_sync_interval_minutes", 30);
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
    })
};

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return row?.value ?? null;
}

export async function getSettingNumber(
  key: string,
  fallback: number
) {
  const existing = await getSetting(key);

  if (existing !== null) {
    const parsed = Number(existing);
    if (Number.isFinite(parsed)) return parsed;
  }

  await db
    .insert(appSettings)
    .values({
      key,
      value: String(fallback),
    })
    .onConflictDoNothing();

  return fallback;
}