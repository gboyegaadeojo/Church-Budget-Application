ALTER TABLE "email_digest_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "email_digest_items" CASCADE;--> statement-breakpoint
ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_email_digest";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "email_reminders";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "email_copies";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "email_digest";