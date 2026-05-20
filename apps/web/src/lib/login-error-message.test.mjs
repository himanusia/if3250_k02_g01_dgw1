import { describe, expect, test } from "bun:test";

import { getLoginErrorMessage } from "./login-error-message.ts";

describe("getLoginErrorMessage", () => {
  test("surfaces whitelist failures from the login error query", () => {
    expect(getLoginErrorMessage("?error=Email%20ini%20belum%20masuk%20whitelist%20aplikasi.")).toBe(
      "Email ini belum masuk whitelist aplikasi."
    );
  });

  test("keeps login clean when there is no error query", () => {
    expect(getLoginErrorMessage("")).toBeNull();
  });
});
