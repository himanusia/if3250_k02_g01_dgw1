import { createContext } from "@if3250_k02_g01_dgw1/api/context";
import { appRouter } from "@if3250_k02_g01_dgw1/api/routers/index";
import { generateCampaignReportPdf } from "@if3250_k02_g01_dgw1/api/lib/campaign-report";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createFileRoute } from "@tanstack/react-router";

async function handleCampaignReportDownloadRequest(request: Request) {
  const url = new URL(request.url);
  const campaignIdValue = url.searchParams.get("campaignId")?.trim();

  if (!campaignIdValue) {
    return new Response("Missing campaignId parameter", { status: 400 });
  }

  const campaignId = Number(campaignIdValue);

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return new Response("Invalid campaignId parameter", { status: 400 });
  }

  const context = await createContext({ req: request });

  if (!context.session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await generateCampaignReportPdf(campaignId);

  if (!report) {
    return new Response("Campaign not found", { status: 404 });
  }

  const headers = new Headers({
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="${report.fileName}"`,
    "content-length": String(report.buffer.byteLength),
    "content-type": "application/pdf",
  });

  return new Response(new Uint8Array(report.buffer), {
    headers,
    status: 200,
  });
}

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

async function handle({ request }: { request: Request }) {
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname === "/api/rpc/campaign-report") {
    return handleCampaignReportDownloadRequest(request);
  }

  const rpcResult = await rpcHandler.handle(request, {
    prefix: "/api/rpc",
    context: await createContext({ req: request }),
  });
  if (rpcResult.response) return rpcResult.response;

  const apiResult = await apiHandler.handle(request, {
    prefix: "/api/rpc/api-reference",
    context: await createContext({ req: request }),
  });
  if (apiResult.response) return apiResult.response;

  return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
