import { createFileRoute } from "@tanstack/react-router";
import { runGlobalSyncBatch } from "@if3250_k02_g01_dgw1/api/routers/kol";
import { env } from "@if3250_k02_g01_dgw1/env/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const Route = createFileRoute("/api/cron/sync-kols")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorizedCronRequest(request, env.CRON_SECRET)) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            {
              headers: { "content-type": "application/json" },
              status: 401,
            }
          );
        }

        const count = await runGlobalSyncBatch(5);

        return new Response(
          JSON.stringify({ ok: true, synced: count }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          }
        );
      },
    },
  },
});