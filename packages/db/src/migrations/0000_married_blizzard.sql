CREATE TYPE "public"."app_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('tiktok', 'instagram', 'youtube', 'shopee', 'other');--> statement-breakpoint
CREATE TABLE "allowed_email" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "app_role" DEFAULT 'user' NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"brand" text NOT NULL,
	"objective" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"kol_target_count" integer DEFAULT 0 NOT NULL,
	"kol_category" text DEFAULT '' NOT NULL,
	"post_briefs" text DEFAULT '' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_kol" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"kol_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kol_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"username" text NOT NULL,
	"field_of_expertise" text NOT NULL,
	"category" text NOT NULL,
	"bio" text,
	"primary_platform" "social_platform" DEFAULT 'instagram' NOT NULL,
	"platform_links" text DEFAULT '' NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"average_likes" integer DEFAULT 0 NOT NULL,
	"average_views" integer DEFAULT 0 NOT NULL,
	"estimated_rate_card" integer DEFAULT 0 NOT NULL,
	"analytics_notes" text DEFAULT '' NOT NULL,
	"engagement_rate" text DEFAULT '' NOT NULL,
	"sales_notes" text DEFAULT '' NOT NULL,
	"campaign_history" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allowed_email" ADD CONSTRAINT "allowed_email_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_kol" ADD CONSTRAINT "campaign_kol_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_kol" ADD CONSTRAINT "campaign_kol_kol_id_kol_profile_id_fk" FOREIGN KEY ("kol_id") REFERENCES "public"."kol_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allowed_email_email_idx" ON "allowed_email" USING btree ("email");--> statement-breakpoint
CREATE INDEX "allowed_email_role_idx" ON "allowed_email" USING btree ("role");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_kol_unique_idx" ON "campaign_kol" USING btree ("campaign_id","kol_id");