ALTER TABLE "expense_submissions" ADD COLUMN "carried_over_from_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD COLUMN "carry_over_reason" text;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD COLUMN "carried_over_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD CONSTRAINT "expense_submissions_carried_over_from_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("carried_over_from_cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;