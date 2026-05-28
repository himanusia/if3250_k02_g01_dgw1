ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "target_post_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "target_reel_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "target_story_count" integer DEFAULT 0 NOT NULL;

UPDATE "campaign"
SET "target_post_count" = "target_content_count"
WHERE "target_post_count" = 0
  AND "target_reel_count" = 0
  AND "target_story_count" = 0
  AND "target_content_count" > 0;
