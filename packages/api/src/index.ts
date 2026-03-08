import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user || !context.access) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      access: context.access,
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
