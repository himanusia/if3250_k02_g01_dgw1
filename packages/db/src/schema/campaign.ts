import { integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { kolProfile } from "./kol";

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
