import { boolean, index, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const appRoleEnum = pgEnum("app_role", ["admin", "user"]);

export type AppRole = (typeof appRoleEnum.enumValues)[number];

export const allowedEmail = pgTable(
  "allowed_email",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    role: appRoleEnum("role").default("user").notNull(),
    note: text("note"),
    isActive: boolean("is_active").default(true).notNull(),
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
    uniqueIndex("allowed_email_email_idx").on(table.email),
    index("allowed_email_role_idx").on(table.role),
  ],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});