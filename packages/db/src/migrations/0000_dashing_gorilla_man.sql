ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_content_archived_at_idx" ON "campaign_content" USING btree ("archived_at");
