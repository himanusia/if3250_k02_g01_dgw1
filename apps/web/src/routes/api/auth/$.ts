import { auth } from "@if3250_k02_g01_dgw1/auth";
import { createFileRoute } from "@tanstack/react-router";

async function handleAuthRequest(request: Request) {
  const url = new URL(request.url);
  const startedAt = Date.now();

  try {
    return await auth.handler(request);
  } catch (error) {
    console.error("[auth] request failed", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error,
      method: request.method,
      pathname: url.pathname,
    });

    throw error;
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        return handleAuthRequest(request);
      },
      POST: ({ request }) => {
        return handleAuthRequest(request);
      },
    },
  },
});
