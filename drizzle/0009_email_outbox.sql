CREATE TYPE "public"."email_audience" AS ENUM('requester', 'accountant', 'church_admin', 'administrator', 'person');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"audience" "email_audience" NOT NULL,
	"to_email" text NOT NULL,
	"to_user_id" uuid,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"budget_request_id" uuid,
	"cycle_id" uuid,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_sent_has_time" CHECK (("email_outbox"."status" = 'sent') = ("email_outbox"."sent_at" is not null)),
	CONSTRAINT "email_outbox_attempts_non_negative" CHECK ("email_outbox"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_request_idx" ON "email_outbox" USING btree ("budget_request_id","created_at");--> statement-breakpoint
-- Sent emails are part of a request's history (FR-21, AC-58): rows change status but are never removed.
CREATE TRIGGER email_outbox_no_delete BEFORE DELETE ON email_outbox
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER email_outbox_no_truncate BEFORE TRUNCATE ON email_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
