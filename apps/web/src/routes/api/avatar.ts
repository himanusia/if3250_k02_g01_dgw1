import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOST_PATTERNS = [/\.cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i, /(^|\.)tiktokcdn\.com$/i, /(^|\.)muscdn\.com$/i];

function isAllowedAvatarHost(hostname: string) {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

async function handleAvatarRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const targetUrl = requestUrl.searchParams.get("url")?.trim();

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let parsedTargetUrl: URL;

  try {
    parsedTargetUrl = new URL(targetUrl);
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedTargetUrl.protocol)) {
    return new Response("Unsupported protocol", { status: 400 });
  }

  if (!isAllowedAvatarHost(parsedTargetUrl.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const upstreamResponse = await fetch(parsedTargetUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,id;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  if (!upstreamResponse.ok) {
    return new Response("Failed to fetch avatar", { status: upstreamResponse.status });
  }

  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  const contentLength = upstreamResponse.headers.get("content-length");
  const etag = upstreamResponse.headers.get("etag");
  const lastModified = upstreamResponse.headers.get("last-modified");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (contentLength) {
    headers.set("content-length", contentLength);
  }

  if (etag) {
    headers.set("etag", etag);
  }

  if (lastModified) {
    headers.set("last-modified", lastModified);
  }

  headers.set("cache-control", "public, max-age=3600, s-maxage=86400");

  return new Response(upstreamResponse.body, {
    headers,
    status: 200,
  });
}

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: ({ request }) => handleAvatarRequest(request),
    },
  },
});
