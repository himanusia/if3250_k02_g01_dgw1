import { integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const socialPlatformEnum = pgEnum("social_platform", ["instagram", "tiktok", "shopee"]);

export const kolSyncStatusEnum = pgEnum("kol_sync_status", ["pending", "success", "failed"]);

export const followerTierEnum = pgEnum("follower_tier", ["nano", "micro", "macro", "mega"]);

export type SocialPlatform = (typeof socialPlatformEnum.enumValues)[number];
export type KolSyncStatus = (typeof kolSyncStatusEnum.enumValues)[number];
export type FollowerTier = (typeof followerTierEnum.enumValues)[number];

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

export const kolProfile = pgTable("kol_profile", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  keywords: text("keywords").default("").notNull(),
  totalFollowers: integer("total_followers").default(0).notNull(),
  averageLikes: integer("average_likes").default(0).notNull(),
  averageViews: integer("average_views").default(0).notNull(),
  engagementRate: text("engagement_rate").default("").notNull(),
  followerTier: followerTierEnum("follower_tier").default("nano").notNull(),
  syncStatus: kolSyncStatusEnum("sync_status").default("pending").notNull(),
  syncMessage: text("sync_message"),
  lastSyncedAt: timestamp("last_synced_at"),
  estimatedRateCard: jsonb("estimated_rate_card").$type<RateCardValue | null>(),
  actualRateCard: jsonb("actual_rate_card").$type<RateCardValue | null>(),
  rateCardMetadata: jsonb("rate_card_metadata").$type<RateCardMetadata | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const kolAccount = pgTable(
  "kol_account",
  {
    id: serial("id").primaryKey(),
    kolId: integer("kol_id")
      .notNull()
      .references(() => kolProfile.id, { onDelete: "cascade" }),
    platform: socialPlatformEnum("platform").notNull(),
    handle: text("handle").notNull(),
    profileUrl: text("profile_url"),
    biography: text("biography"),
    metadata: jsonb("metadata"),
    externalId: text("external_id"),
    followers: integer("followers").default(0).notNull(),
    averageLikes: integer("average_likes").default(0).notNull(),
    averageViews: integer("average_views").default(0).notNull(),
    engagementRate: text("engagement_rate").default("").notNull(),
    syncStatus: kolSyncStatusEnum("sync_status").default("pending").notNull(),
    syncMessage: text("sync_message"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("kol_account_platform_handle_idx").on(table.platform, table.handle)],
);

export const kolCampaignHistory = pgTable("kol_campaign_history", {
  id: serial("id").primaryKey(),
  kolId: integer("kol_id")
    .notNull()
    .references(() => kolProfile.id, { onDelete: "cascade" }),
  campaignName: text("campaign_name").notNull(),
  brand: text("brand").notNull(),
  platform: socialPlatformEnum("platform").notNull(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kolRateCardHistory = pgTable("kol_rate_card_history", {
  id: serial("id").primaryKey(),
  kolId: integer("kol_id")
    .notNull()
    .references(() => kolProfile.id, { onDelete: "cascade" }),
  oldActualRateCard: jsonb("old_actual_rate_card").$type<RateCardValue | null>(),
  newActualRateCard: jsonb("new_actual_rate_card").$type<RateCardValue | null>(),
  reason: text("reason"),
  changedByUserId: text("changed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
