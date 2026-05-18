import { describe, expect, test } from "bun:test";

import { isAuthorizedCronRequest } from "./cron-auth.ts";

describe("isAuthorizedCronRequest", () => {
  test("rejects when no cron secret is configured", () => {
    const request = new Request("http://localhost/api/cron/sync-kols", {
      headers: { authorization: "Bearer configured-secret" },
    });

    expect(isAuthorizedCronRequest(request, "")).toBe(false);
  });

  test("rejects requests without a bearer token", () => {
    const request = new Request("http://localhost/api/cron/sync-kols");

    expect(isAuthorizedCronRequest(request, "configured-secret")).toBe(false);
  });

  test("rejects requests with the wrong bearer token", () => {
    const request = new Request("http://localhost/api/cron/sync-kols", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    expect(isAuthorizedCronRequest(request, "configured-secret")).toBe(false);
  });

  test("accepts requests with the configured bearer token", () => {
    const request = new Request("http://localhost/api/cron/sync-kols", {
      headers: { authorization: "Bearer configured-secret" },
    });

    expect(isAuthorizedCronRequest(request, "configured-secret")).toBe(true);
  });
});
