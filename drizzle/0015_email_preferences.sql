CREATE TABLE "email_digest_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"href" text NOT NULL,
	"budget_request_id" uuid,
	"cycle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"digested_at" timestamp with time zone,
	"outbox_id" uuid,
	CONSTRAINT "email_digest_items_digested" CHECK (("email_digest_items"."digested_at" is null) = ("email_digest_items"."outbox_id" is null))
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "email_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "email_copies" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "email_digest" text DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_digest_items" ADD CONSTRAINT "email_digest_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_digest_items" ADD CONSTRAINT "email_digest_items_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_digest_items" ADD CONSTRAINT "email_digest_items_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_digest_items" ADD CONSTRAINT "email_digest_items_outbox_id_email_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."email_outbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_digest_items_pending_idx" ON "email_digest_items" USING btree ("user_id","created_at") WHERE "email_digest_items"."digested_at" is null;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_email_digest" CHECK ("user_preferences"."email_digest" in ('instant', 'daily'));--> statement-breakpoint
-- FR-21: a digest item is kept as the record of what was folded into which email.
CREATE TRIGGER email_digest_items_no_delete BEFORE DELETE ON email_digest_items
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER email_digest_items_no_truncate BEFORE TRUNCATE ON email_digest_items
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
