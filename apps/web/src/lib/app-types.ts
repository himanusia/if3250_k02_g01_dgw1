export type AccessRole = "admin" | "user";

export type AccessEntry = {
  createdAt: string;
  createdByUserId: string | null;
  email: string;
  id: number;
  isActive: boolean;
  note: string | null;
  role: AccessRole;
  updatedAt: string;
};

export type KolRecord = {
  analyticsNotes: string;
  averageLikes: number;
  averageViews: number;
  bio: string | null;
  campaignHistory: string;
  category: string;
  createdAt: string;
  displayName: string;
  engagementRate: string;
  estimatedRateCard: number;
  fieldOfExpertise: string;
  followers: number;
  id: number;
  keywords: string;
  platformLinks: string;
  primaryPlatform: "tiktok" | "instagram" | "youtube" | "shopee" | "other";
  salesNotes: string;
  updatedAt: string;
  username: string;
};

export type CampaignRecord = {
  brand: string;
  createdAt: string;
  description: string;
  id: number;
  keywords: string;
  kolCategory: string;
  kolTargetCount: number;
  kols: Array<{ displayName: string; id: number; username: string }>;
  name: string;
  objective: string;
  periodEnd: string;
  periodStart: string;
  postBriefs: string;
  status: "draft" | "active" | "completed" | "archived";
  updatedAt: string;
};