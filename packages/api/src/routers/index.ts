import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { accessRouter } from "./access.js";
import { campaignRouter } from "./campaign.js";
import { kolRouter } from "./kol.js";

export const appRouter = {
  access: accessRouter,
  campaign: campaignRouter,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  kol: kolRouter,
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      access: context.access,
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
