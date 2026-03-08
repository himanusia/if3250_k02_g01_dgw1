import { db } from "@if3250_k02_g01_dgw1/db";
import { allowedEmail } from "@if3250_k02_g01_dgw1/db/schema/access";
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
};
