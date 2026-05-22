DO $$
BEGIN
  IF to_regclass('public.allowed_email') IS NOT NULL AND to_regclass('public.whitelist') IS NULL THEN
    ALTER TABLE "allowed_email" RENAME TO "whitelist";
  END IF;
END $$;--> statement-breakpoint
ALTER INDEX IF EXISTS "allowed_email_email_idx" RENAME TO "whitelist_email_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "allowed_email_role_idx" RENAME TO "whitelist_role_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "allowed_email_pkey" RENAME TO "whitelist_pkey";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'allowed_email_created_by_user_id_user_id_fk'
      AND conrelid = 'public.whitelist'::regclass
  ) THEN
    ALTER TABLE "whitelist" RENAME CONSTRAINT "allowed_email_created_by_user_id_user_id_fk" TO "whitelist_created_by_user_id_user_id_fk";
  END IF;
END $$;--> statement-breakpoint
ALTER SEQUENCE IF EXISTS "allowed_email_id_seq" RENAME TO "whitelist_id_seq";
