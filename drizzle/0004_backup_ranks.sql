DROP INDEX "user_departments_one_backup";--> statement-breakpoint
ALTER TABLE "user_departments" ADD COLUMN "backup_rank" smallint;--> statement-breakpoint
-- Existing Backups (at most one per department until now) become Backup 1.
UPDATE "user_departments" SET "backup_rank" = 1 WHERE "representative_type" = 'backup';--> statement-breakpoint
CREATE UNIQUE INDEX "user_departments_backup_rank" ON "user_departments" USING btree ("department_id","backup_rank") WHERE "user_departments"."representative_type" = 'backup';--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_backup_rank_valid" CHECK (("user_departments"."representative_type" = 'backup') = ("user_departments"."backup_rank" is not null)
        and ("user_departments"."backup_rank" is null or "user_departments"."backup_rank" in (1, 2)));