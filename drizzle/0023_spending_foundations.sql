CREATE TABLE "budget_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"budget_cycle_id" uuid NOT NULL,
	"amount_before_tax_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"tax_rate" numeric(5, 4) NOT NULL,
	"reason" text NOT NULL,
	"board_reference" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_amendments_amounts_reconcile" CHECK ("budget_amendments"."amount_cents" <> 0 and "budget_amendments"."amount_before_tax_cents" + "budget_amendments"."tax_cents" = "budget_amendments"."amount_cents"),
	CONSTRAINT "budget_amendments_reason" CHECK (btrim("budget_amendments"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "spending_entries" ADD COLUMN "budget_line_item_id" uuid;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD COLUMN "unbudgeted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_budget_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("budget_cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_amendments_cycle_department_idx" ON "budget_amendments" USING btree ("budget_cycle_id","department_id");--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_budget_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("budget_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- FR-27: amendments are separate, permanent records; never changed or deleted.
CREATE TRIGGER budget_amendments_append_only BEFORE UPDATE OR DELETE ON budget_amendments
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER budget_amendments_no_truncate BEFORE TRUNCATE ON budget_amendments
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
