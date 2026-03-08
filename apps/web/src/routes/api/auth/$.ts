import { auth } from "@if3250_k02_g01_dgw1/auth";
import { env } from "@if3250_k02_g01_dgw1/env/server";
import { createFileRoute } from "@tanstack/react-router";

async function handleAuthRequest(request: Request) {
  const url = new URL(request.url);
  const startedAt = Date.now();

  const fiveSecondWarning = setTimeout(() => {
    console.error("[auth] request still running after 5s", {
      method: request.method,
      pathname: url.pathname,
    });
  }, 5_000);

  const twentySecondWarning = setTimeout(() => {
    console.error("[auth] request still running after 20s", {
      method: request.method,
      pathname: url.pathname,
    });
  }, 20_000);

  try {
    console.info("[auth] request start", {
      host: url.host,
      method: request.method,
      pathname: url.pathname,
    });

    if (url.pathname.includes("/sign-in/social") || url.pathname.includes("/callback/")) {
      console.info("[auth] env summary", {
        baseUrlHost: new URL(env.BETTER_AUTH_URL).host,
        corsOriginHost: new URL(env.CORS_ORIGIN).host,
        requestHost: url.host,
      });
    }

    const response = await auth.handler(request);

    console.info("[auth] request success", {
      durationMs: Date.now() - startedAt,
      method: request.method,
      pathname: url.pathname,
      status: response.status,
    });

    return response;
  } catch (error) {
    console.error("[auth] request failed", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error,
      method: request.method,
      pathname: url.pathname,
    });

    throw error;
  } finally {
    clearTimeout(fiveSecondWarning);
    clearTimeout(twentySecondWarning);
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
