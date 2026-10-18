CREATE TABLE "sms_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"to_phone" text NOT NULL,
	"to_user_id" uuid,
	"body" text NOT NULL,
	"expense_submission_id" uuid,
	"cycle_id" uuid,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"dedupe_key" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_outbox_sent_has_time" CHECK (("sms_outbox"."status" = 'sent') = ("sms_outbox"."sent_at" is not null)),
	CONSTRAINT "sms_outbox_attempts_non_negative" CHECK ("sms_outbox"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_outbox" ADD CONSTRAINT "sms_outbox_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_outbox_dedupe_key" ON "sms_outbox" USING btree ("dedupe_key","to_phone") WHERE "sms_outbox"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "sms_outbox_due_idx" ON "sms_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "sms_outbox_sent_idx" ON "sms_outbox" USING btree ("sent_at");--> statement-breakpoint
-- Texts are part of the notification history: rows change status but are never removed.
CREATE TRIGGER sms_outbox_no_delete BEFORE DELETE ON sms_outbox
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER sms_outbox_no_truncate BEFORE TRUNCATE ON sms_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
INSERT INTO app_settings (key, value) VALUES ('sms_monthly_limit', '300') ON CONFLICT (key) DO NOTHING;
