import { createFileRoute } from "@tanstack/react-router";
import { runGlobalSyncBatch } from "@if3250_k02_g01_dgw1/api/routers/kol";

export const Route = createFileRoute("/api/cron/sync-kols")({
  server: {
    handlers: {
      GET: async () => {
        console.log("[CRON] triggered");

        const count = await runGlobalSyncBatch(5);

        return new Response(
          JSON.stringify({ ok: true, synced: count }),
          { status: 200 }
        );
      },
    },
  },
});