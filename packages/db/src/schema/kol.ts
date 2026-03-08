import { integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const socialPlatformEnum = pgEnum("social_platform", [
  "tiktok",
  "instagram",
  "youtube",
  "shopee",
  "other",
]);

export type SocialPlatform = (typeof socialPlatformEnum.enumValues)[number];

export const kolProfile = pgTable("kol_profile", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  username: text("username").notNull(),
  fieldOfExpertise: text("field_of_expertise").notNull(),
  category: text("category").notNull(),
  bio: text("bio"),
  primaryPlatform: socialPlatformEnum("primary_platform").default("instagram").notNull(),
  platformLinks: text("platform_links").default("").notNull(),
  keywords: text("keywords").default("").notNull(),
  followers: integer("followers").default(0).notNull(),
  averageLikes: integer("average_likes").default(0).notNull(),
  averageViews: integer("average_views").default(0).notNull(),
  estimatedRateCard: integer("estimated_rate_card").default(0).notNull(),
  analyticsNotes: text("analytics_notes").default("").notNull(),
  engagementRate: text("engagement_rate").default("").notNull(),
  salesNotes: text("sales_notes").default("").notNull(),
  campaignHistory: text("campaign_history").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
