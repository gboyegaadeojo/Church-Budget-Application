CREATE TYPE "public"."expense_decision_channel" AS ENUM('in_app', 'verbal');--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD COLUMN "channel" "expense_decision_channel" DEFAULT 'in_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD COLUMN "recorded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD COLUMN "recorded_note" text;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD CONSTRAINT "expense_decisions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD CONSTRAINT "expense_decisions_verbal_recorded" CHECK (("expense_decisions"."channel" = 'verbal') = ("expense_decisions"."recorded_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD CONSTRAINT "expense_decisions_verbal_shape" CHECK ("expense_decisions"."channel" <> 'verbal' or ("expense_decisions"."recorded_by_user_id" <> "expense_decisions"."decided_by_user_id"
        and "expense_decisions"."decision" in ('approved', 'approved_different_amount')
        and btrim(coalesce("expense_decisions"."recorded_note", '')) <> ''));