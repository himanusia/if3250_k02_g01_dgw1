export type WhitelistRole = "admin" | "user";
export type SocialPlatform = "instagram" | "tiktok";
export type SyncStatus = "pending" | "success" | "failed";
export type FollowerTier = "nano" | "micro" | "macro" | "mega";

export type RateCardRange = {
  max: number;
  min: number;
  suggested: number;
};

export type RateCardValue = {
  currency: "IDR";
  post: RateCardRange;
  reel: RateCardRange;
  story: RateCardRange;
};

export type RateCardMetadata = {
  confidence: number;
  lastComputedAt: string;
  modelVersion: string;
  source: "formula";
};

export type WhitelistEntry = {
  createdAt: string;
  createdByUserId: string | null;
  email: string;
  id: number;
  isActive: boolean;
  note: string | null;
  role: WhitelistRole;
  updatedAt: string;
};

export type KolAccountRecord = {
  averageLikes: number;
  averageViews: number;
  biography: string | null;
  createdAt: string;
  engagementRate: string;
  externalId: string | null;
  followers: number;
  handle: string;
  id: number;
  kolId: number;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown> | null;
  platform: SocialPlatform;
  profileUrl: string | null;
  syncMessage: string | null;
  syncStatus: SyncStatus;
  updatedAt: string;
};

export type KolCampaignHistoryRecord = {
  brand: string;
  campaignName: string;
  createdAt: string;
  endedAt: string | null;
  id: number;
  kolId: number;
  notes: string | null;
  platform: SocialPlatform;
  startedAt: string | null;
};

export type KolRateCardHistoryRecord = {
  changedByUserId: string | null;
  createdAt: string;
  id: number;
  kolId: number;
  newActualRateCard: RateCardValue | null;
  oldActualRateCard: RateCardValue | null;
  reason: string | null;
};

export type KolRecord = {
  accounts: KolAccountRecord[];
  createdAt: string;
  displayName: string;
  engagementRate: string;
  followerTier: FollowerTier;
  history: KolCampaignHistoryRecord[];
  id: number;
  keywords: string;
  lastSyncedAt: string | null;
  syncMessage: string | null;
  syncStatus: SyncStatus;
  totalFollowers: number;
  updatedAt: string;
  averageLikes: number;
  averageViews: number;
  estimatedRateCard: RateCardValue | null;
  actualRateCard: RateCardValue | null;
  rateCardMetadata: RateCardMetadata | null;
  rateCardHistory: KolRateCardHistoryRecord[];
};

export type CampaignRecord = {
  brand: string;
  createdAt: string;
  description: string;
  id: number;
  keywords: string;
  selectedKolIds: number[];
  kols: Array<{ displayName: string; handles: string[]; id: number }>;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  status: "draft" | "active" | "completed" | "archived";
  targetFollowerTier: string;
  targetKolCount: number;
  updatedAt: string;
};

export type CampaignContentRecord = {
  archivedAt: string | null;
  authorDisplayName: string;
  authorHandle: string;
  campaignId: number;
  caption: string;
  commentCount: number;
  contentUrl: string;
  createdAt: string;
  externalId: string | null;
  engagementRate: string;
  id: number;
  kolDisplayName: string;
  kolHandles: string[];
  kolId: number;
  likeCount: number;
  metadata: Record<string, unknown> | null;
  platform: SocialPlatform;
  postedAt: string | null;
  shareCount: number;
  syncErrorCode: string | null;
  syncMessage: string | null;
  syncStatus: SyncStatus;
  syncedAt: string | null;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: string;
  viewCount: number;
};

export type CampaignContentGroupRecord = {
  contents: CampaignContentRecord[];
  displayName: string;
  handles: string[];
  kolId: number;
};

export type CampaignDetailRecord = CampaignRecord & {
  contentsByKol: CampaignContentGroupRecord[];
};
