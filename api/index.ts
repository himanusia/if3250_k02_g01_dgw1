import { Readable } from "node:stream";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { IncomingMessage, ServerResponse } from "node:http";

type ServerModule = {
  default: {
    fetch: (request: Request) => Promise<Response>;
  };
};

const serverModulePromise: Promise<ServerModule> = import(
  pathToFileURL(join(process.cwd(), "apps/web/dist/server/server.js")).href
) as Promise<ServerModule>;

function toRequest(req: IncomingMessage) {
  const protocol = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      headers.append(key, value);
    }
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, {
      headers,
      method: req.method,
    });
  }

  return new Request(url, {
    body: Readable.toWeb(req) as BodyInit,
    // Required by the Node fetch implementation for streamed request bodies.
    duplex: "half" as never,
    headers,
    method: req.method,
  });
}

function applyResponseHeaders(response: Response, res: ServerResponse) {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;

  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(response.headers);

    if (cookies.length) {
      res.setHeader("set-cookie", cookies);
    }
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      return;
    }

    res.setHeader(key, value);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const serverModule = await serverModulePromise;
  const response = await serverModule.default.fetch(toRequest(req));

  res.statusCode = response.status;
  applyResponseHeaders(response, res);

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body as ReadableStream).pipe(res);
}
