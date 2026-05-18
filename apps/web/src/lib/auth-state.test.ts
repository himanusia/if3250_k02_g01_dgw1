import { describe, expect, test } from "bun:test";

import { loadAuthStateSafely } from "./auth-state";

describe("loadAuthStateSafely", () => {
  test("returns an anonymous auth state instead of leaking server auth failures", async () => {
    const authState = await loadAuthStateSafely(async () => {
      throw new Error("HTTPError");
    });

    expect(authState).toEqual({ access: null, session: null });
  });
});
