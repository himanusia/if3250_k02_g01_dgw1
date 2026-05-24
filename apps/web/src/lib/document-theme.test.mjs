import { describe, expect, test } from "bun:test";

import { getDocumentThemeClass } from "./document-theme.ts";

describe("getDocumentThemeClass", () => {
  test("uses the DigiWonder light theme on home dashboard, campaigns, and whitelist", () => {
    expect(getDocumentThemeClass("/")).toBe("digiTheme");
    expect(getDocumentThemeClass("/campaigns")).toBe("digiTheme");
    expect(getDocumentThemeClass("/whitelist")).toBe("digiTheme");
  });

  test("keeps login on the DigiWonder light theme", () => {
    expect(getDocumentThemeClass("/login")).toBe("digiTheme");
  });

  test("uses the DigiWonder light theme on every app page", () => {
    expect(getDocumentThemeClass("/kols")).toBe("digiTheme");
    expect(getDocumentThemeClass("/compare-kols")).toBe("digiTheme");
    expect(getDocumentThemeClass("/unauthorized")).toBe("digiTheme");
    expect(getDocumentThemeClass("/anything-new")).toBe("digiTheme");
  });
});
