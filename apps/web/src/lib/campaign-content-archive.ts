export type ArchiveableCampaignContent = {
  archivedAt: string | null;
};

export function splitCampaignContentsByArchiveState<TContent extends ArchiveableCampaignContent>(contents: TContent[]) {
  return contents.reduce(
    (grouped, content) => {
      if (content.archivedAt) {
        grouped.archivedContents.push(content);
      } else {
        grouped.activeContents.push(content);
      }

      return grouped;
    },
    {
      activeContents: [] as TContent[],
      archivedContents: [] as TContent[],
    },
  );
}
