ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "budget_idr" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "target_content_count" integer DEFAULT 0 NOT NULL;
