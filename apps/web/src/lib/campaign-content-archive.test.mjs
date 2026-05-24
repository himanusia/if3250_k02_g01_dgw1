import { describe, expect, test } from "bun:test";

import { splitCampaignContentsByArchiveState } from "./campaign-content-archive.ts";

const baseContent = {
  archivedAt: null,
  id: 1,
};

describe("splitCampaignContentsByArchiveState", () => {
  test("separates active and archived campaign posts without dropping records", () => {
    const activePost = { ...baseContent, id: 101, archivedAt: null };
    const archivedPost = { ...baseContent, id: 202, archivedAt: "2026-05-20T10:00:00.000Z" };

    expect(splitCampaignContentsByArchiveState([archivedPost, activePost])).toEqual({
      activeContents: [activePost],
      archivedContents: [archivedPost],
    });
  });
});
