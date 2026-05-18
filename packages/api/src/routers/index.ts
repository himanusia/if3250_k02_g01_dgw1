import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { whitelistRouter } from "./whitelist.js";
import { campaignRouter } from "./campaign.js";
import { kolRouter } from "./kol.js";

export const appRouter = {
  whitelist: whitelistRouter,
  campaign: campaignRouter,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  kol: kolRouter,
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      whitelist: context.whitelist,
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
