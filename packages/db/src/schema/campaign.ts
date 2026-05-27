import { boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { kolProfile } from "./kol";
import { kolSyncStatusEnum, socialPlatformEnum } from "./kol";

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "completed",
  "archived",
]);

export type CampaignStatus = (typeof campaignStatusEnum.enumValues)[number];

export const campaign = pgTable("campaign", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  brand: text("brand").notNull(),
  objective: text("objective").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  keywords: text("keywords").default("").notNull(),
  targetKolCount: integer("target_kol_count").default(0).notNull(),
  targetFollowerTier: text("target_follower_tier").default("").notNull(),
  postBriefs: text("post_briefs").default("").notNull(),
  status: campaignStatusEnum("status").default("draft").notNull(),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const campaignKol = pgTable(
  "campaign_kol",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    kolId: integer("kol_id")
      .notNull()
      .references(() => kolProfile.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("campaign_kol_unique_idx").on(table.campaignId, table.kolId)],
);

export const campaignContent = pgTable(
  "campaign_content",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    kolId: integer("kol_id")
      .notNull()
      .references(() => kolProfile.id, { onDelete: "cascade" }),
    contentUrl: text("content_url").notNull(),
    contentType: text("content_type").default("post").notNull(),
    budgetIdr: integer("budget_idr"),
    platform: socialPlatformEnum("platform").notNull(),
    externalId: text("external_id"),
    title: text("title").default("").notNull(),
    caption: text("caption").default("").notNull(),
    authorDisplayName: text("author_display_name").default("").notNull(),
    authorHandle: text("author_handle").default("").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    postedAt: timestamp("posted_at"),
    likeCount: integer("like_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    shareCount: integer("share_count").default(0).notNull(),
    estimatedViewCount: integer("estimated_view_count").default(0).notNull(),
    estimatedLikeCount: integer("estimated_like_count").default(0).notNull(),
    estimatedCommentCount: integer("estimated_comment_count").default(0).notNull(),
    estimatedShareCount: integer("estimated_share_count").default(0).notNull(),
    isFyp: boolean("is_fyp"),
    engagementRate: text("engagement_rate").default("").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    syncStatus: kolSyncStatusEnum("sync_status").default("pending").notNull(),
    syncMessage: text("sync_message"),
    syncErrorCode: text("sync_error_code"),
    syncedAt: timestamp("synced_at"),
    archivedAt: timestamp("archived_at"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("campaign_content_campaign_url_idx").on(table.campaignId, table.contentUrl),
    index("campaign_content_campaign_idx").on(table.campaignId),
    index("campaign_content_kol_idx").on(table.kolId),
    index("campaign_content_sync_status_idx").on(table.syncStatus),
    index("campaign_content_archived_at_idx").on(table.archivedAt),
  ],
);
