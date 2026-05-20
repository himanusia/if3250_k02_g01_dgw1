import { describe, expect, test } from "bun:test";

import { getDocumentThemeClass } from "./document-theme.ts";

describe("getDocumentThemeClass", () => {
  test("uses the DigiWonder light theme on dashboard, campaigns, and whitelist", () => {
    expect(getDocumentThemeClass("/dashboard")).toBe("digiTheme");
    expect(getDocumentThemeClass("/campaigns")).toBe("digiTheme");
    expect(getDocumentThemeClass("/whitelist")).toBe("digiTheme");
  });

  test("keeps login on the DigiWonder light theme", () => {
    expect(getDocumentThemeClass("/login")).toBe("digiTheme");
  });

  test("keeps the legacy dark theme for other authenticated pages", () => {
    expect(getDocumentThemeClass("/kols")).toBe("dark");
    expect(getDocumentThemeClass("/compare-kols")).toBe("dark");
  });
});
