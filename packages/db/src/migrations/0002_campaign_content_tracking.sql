ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "content_type" text DEFAULT 'post' NOT NULL;
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "budget_idr" integer;
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "estimated_view_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "estimated_like_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "estimated_comment_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "estimated_share_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign_content" ADD COLUMN IF NOT EXISTS "is_fyp" boolean;
