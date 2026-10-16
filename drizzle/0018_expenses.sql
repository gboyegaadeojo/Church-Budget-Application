CREATE TYPE "public"."expense_decision" AS ENUM('approved', 'approved_different_amount', 'returned', 'declined');--> statement-breakpoint
CREATE TYPE "public"."expense_decision_level" AS ENUM('accountant', 'board');--> statement-breakpoint
CREATE TYPE "public"."expense_revision_kind" AS ENUM('submission', 'edit', 'clarification_response');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('draft', 'submitted', 'in_review', 'returned', 'awaiting_board', 'approved', 'processing', 'paid', 'purchased', 'closed', 'cancelled', 'withdrawn', 'declined');--> statement-breakpoint
CREATE TYPE "public"."expense_type" AS ENUM('purchase_request', 'expense_claim');--> statement-breakpoint
CREATE TYPE "public"."expense_how_bought" AS ENUM('church_account', 'requester_claims', 'supplier_invoice');--> statement-breakpoint
CREATE TYPE "public"."expense_payee_kind" AS ENUM('self', 'other', 'church_card');--> statement-breakpoint
CREATE TYPE "public"."expense_payment_method" AS ENUM('cheque', 'church_card', 'cash', 'e_transfer', 'supplier_eft', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_payment_preference" AS ENUM('cheque', 'e_transfer', 'none');--> statement-breakpoint
CREATE TYPE "public"."spending_entry_status" AS ENUM('recorded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."spending_entry_type" AS ENUM('expense', 'refund');--> statement-breakpoint
ALTER TYPE "public"."email_audience" ADD VALUE 'board';--> statement-breakpoint
CREATE TABLE "expense_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"level" "expense_decision_level" NOT NULL,
	"decision" "expense_decision" NOT NULL,
	"approved_subtotal_cents" bigint,
	"approved_tax_cents" bigint,
	"approved_total_cents" bigint,
	"reason" text,
	"remaining_after_cents" bigint,
	"decided_by_user_id" uuid NOT NULL,
	"acting_role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_decisions_amounts_reconcile" CHECK (("expense_decisions"."approved_subtotal_cents" is null and "expense_decisions"."approved_tax_cents" is null and "expense_decisions"."approved_total_cents" is null)
        or ("expense_decisions"."approved_subtotal_cents" >= 0 and "expense_decisions"."approved_tax_cents" >= 0
            and "expense_decisions"."approved_total_cents" = "expense_decisions"."approved_subtotal_cents" + "expense_decisions"."approved_tax_cents")),
	CONSTRAINT "expense_decisions_approval_has_amount" CHECK ("expense_decisions"."decision" not in ('approved', 'approved_different_amount') or "expense_decisions"."approved_total_cents" is not null)
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"line_total_cents" bigint NOT NULL,
	"product_url" text,
	"annual_line_item_id" uuid,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_items_quantity_range" CHECK ("expense_items"."quantity" between 1 and 10000),
	CONSTRAINT "expense_items_unit_price_range" CHECK ("expense_items"."unit_price_cents" between 0 and 100000000),
	CONSTRAINT "expense_items_total_reconciles" CHECK ("expense_items"."line_total_cents" = "expense_items"."quantity"::bigint * "expense_items"."unit_price_cents"),
	CONSTRAINT "expense_items_url_http" CHECK ("expense_items"."product_url" is null or "expense_items"."product_url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "expense_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"method" "expense_payment_method" NOT NULL,
	"method_other" text,
	"paid_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"difference_note" text,
	"reference" text,
	"cheque_signer_1_id" uuid,
	"cheque_signer_1_name" text,
	"cheque_signer_2_id" uuid,
	"cheque_signer_2_name" text,
	"purchased_by" text,
	"cash_received_by" text,
	"receipt_signed" boolean,
	"notes" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_payments_expense_submission_id_unique" UNIQUE("expense_submission_id"),
	CONSTRAINT "expense_payments_amount_positive" CHECK ("expense_payments"."amount_cents" > 0),
	CONSTRAINT "expense_payments_cheque_signers" CHECK ("expense_payments"."method" <> 'cheque' or ("expense_payments"."cheque_signer_1_id" is not null and "expense_payments"."cheque_signer_2_id" is not null
        and "expense_payments"."cheque_signer_1_id" <> "expense_payments"."cheque_signer_2_id" and "expense_payments"."reference" is not null)),
	CONSTRAINT "expense_payments_other_named" CHECK ("expense_payments"."method" <> 'other' or "expense_payments"."method_other" is not null)
);
--> statement-breakpoint
CREATE TABLE "expense_receipt_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" uuid,
	CONSTRAINT "expense_receipt_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "expense_receipt_files_type" CHECK ("expense_receipt_files"."content_type" in ('image/jpeg', 'image/png', 'application/pdf')),
	CONSTRAINT "expense_receipt_files_size" CHECK ("expense_receipt_files"."size_bytes" > 0 and "expense_receipt_files"."size_bytes" <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "expense_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"purchase_date" date NOT NULL,
	"vendor" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"receipt_number" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_receipt_lines_amount_range" CHECK ("expense_receipt_lines"."amount_cents" between 1 and 100000000)
);
--> statement-breakpoint
CREATE TABLE "expense_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"kind" "expense_revision_kind" NOT NULL,
	"edited_by_user_id" uuid NOT NULL,
	"tax_rate" numeric(5, 4),
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_revisions_submission_number_key" UNIQUE("expense_submission_id","revision_number"),
	CONSTRAINT "expense_revisions_reconciles" CHECK ("expense_revisions"."subtotal_cents" >= 0 and "expense_revisions"."tax_cents" >= 0 and "expense_revisions"."total_cents" = "expense_revisions"."subtotal_cents" + "expense_revisions"."tax_cents")
);
--> statement-breakpoint
CREATE TABLE "expense_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_number" text,
	"type" "expense_type" NOT NULL,
	"budget_cycle_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"department_name_snapshot" text NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"justification" text DEFAULT '' NOT NULL,
	"status" "expense_status" DEFAULT 'draft' NOT NULL,
	"tax_rate" numeric(5, 4),
	"subtotal_cents" bigint,
	"tax_cents" bigint,
	"total_cents" bigint,
	"approved_subtotal_cents" bigint,
	"approved_tax_cents" bigint,
	"approved_total_cents" bigint,
	"approval_note" text,
	"over_budget_explanation" text,
	"late_claim_explanation" text,
	"how_bought" "expense_how_bought",
	"linked_purchase_request_id" uuid,
	"payee_kind" "expense_payee_kind",
	"payee_name" text,
	"payee_email" text,
	"payee_user_id" uuid,
	"payment_preference" "expense_payment_preference",
	"no_receipt_reason" text,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_submissions_reference_number_unique" UNIQUE("reference_number"),
	CONSTRAINT "expense_submissions_amounts_reconcile" CHECK (("expense_submissions"."subtotal_cents" is null and "expense_submissions"."tax_cents" is null and "expense_submissions"."total_cents" is null)
        or ("expense_submissions"."subtotal_cents" >= 0 and "expense_submissions"."tax_cents" >= 0
            and "expense_submissions"."total_cents" = "expense_submissions"."subtotal_cents" + "expense_submissions"."tax_cents")),
	CONSTRAINT "expense_submissions_approved_reconcile" CHECK (("expense_submissions"."approved_subtotal_cents" is null and "expense_submissions"."approved_tax_cents" is null and "expense_submissions"."approved_total_cents" is null)
        or ("expense_submissions"."approved_subtotal_cents" >= 0 and "expense_submissions"."approved_tax_cents" >= 0
            and "expense_submissions"."approved_total_cents" = "expense_submissions"."approved_subtotal_cents" + "expense_submissions"."approved_tax_cents")),
	CONSTRAINT "expense_submissions_submitted_has_snapshot" CHECK ("expense_submissions"."status" = 'draft' or ("expense_submissions"."total_cents" is not null
        and "expense_submissions"."reference_number" is not null and "expense_submissions"."submitted_at" is not null)),
	CONSTRAINT "expense_submissions_claim_adds_no_tax" CHECK ("expense_submissions"."type" <> 'expense_claim' or "expense_submissions"."tax_cents" is null or "expense_submissions"."tax_cents" = 0),
	CONSTRAINT "expense_submissions_charged_has_amount" CHECK ("expense_submissions"."status" not in ('approved', 'processing', 'paid', 'purchased', 'closed', 'cancelled')
        or "expense_submissions"."approved_total_cents" is not null),
	CONSTRAINT "expense_submissions_tax_rate_range" CHECK ("expense_submissions"."tax_rate" is null or ("expense_submissions"."tax_rate" >= 0 and "expense_submissions"."tax_rate" <= 1))
);
--> statement-breakpoint
CREATE TABLE "spending_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_cycle_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"budget_request_id" uuid,
	"expense_submission_id" uuid,
	"entry_type" "spending_entry_type" NOT NULL,
	"spent_on" date NOT NULL,
	"payee" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"payment_method" text,
	"reference_number" text,
	"notes" text,
	"overspend_note" text,
	"status" "spending_entry_status" DEFAULT 'recorded' NOT NULL,
	"void_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spending_entries_amount_positive" CHECK ("spending_entries"."amount_cents" > 0),
	CONSTRAINT "spending_entries_void_has_reason" CHECK ("spending_entries"."status" <> 'voided' or "spending_entries"."void_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "expense_submission_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD CONSTRAINT "expense_decisions_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD CONSTRAINT "expense_decisions_revision_id_expense_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."expense_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_decisions" ADD CONSTRAINT "expense_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_annual_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("annual_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_cheque_signer_1_id_signing_authorities_id_fk" FOREIGN KEY ("cheque_signer_1_id") REFERENCES "public"."signing_authorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_cheque_signer_2_id_signing_authorities_id_fk" FOREIGN KEY ("cheque_signer_2_id") REFERENCES "public"."signing_authorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipt_files" ADD CONSTRAINT "expense_receipt_files_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipt_files" ADD CONSTRAINT "expense_receipt_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipt_files" ADD CONSTRAINT "expense_receipt_files_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipt_lines" ADD CONSTRAINT "expense_receipt_lines_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD CONSTRAINT "expense_submissions_budget_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("budget_cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD CONSTRAINT "expense_submissions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD CONSTRAINT "expense_submissions_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD CONSTRAINT "expense_submissions_linked_purchase_request_id_expense_submissions_id_fk" FOREIGN KEY ("linked_purchase_request_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submissions" ADD CONSTRAINT "expense_submissions_payee_user_id_users_id_fk" FOREIGN KEY ("payee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_budget_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("budget_cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_entries" ADD CONSTRAINT "spending_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_decisions_submission_idx" ON "expense_decisions" USING btree ("expense_submission_id","created_at");--> statement-breakpoint
CREATE INDEX "expense_items_submission_idx" ON "expense_items" USING btree ("expense_submission_id","sort_order");--> statement-breakpoint
CREATE INDEX "expense_receipt_files_submission_idx" ON "expense_receipt_files" USING btree ("expense_submission_id");--> statement-breakpoint
CREATE INDEX "expense_receipt_lines_submission_idx" ON "expense_receipt_lines" USING btree ("expense_submission_id","sort_order");--> statement-breakpoint
CREATE INDEX "expense_submissions_cycle_department_idx" ON "expense_submissions" USING btree ("budget_cycle_id","department_id");--> statement-breakpoint
CREATE INDEX "expense_submissions_status_idx" ON "expense_submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "spending_entries_cycle_department_idx" ON "spending_entries" USING btree ("budget_cycle_id","department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spending_entries_one_per_expense" ON "spending_entries" USING btree ("expense_submission_id") WHERE "spending_entries"."expense_submission_id" is not null and "spending_entries"."status" = 'recorded';--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_expense_idx" ON "email_outbox" USING btree ("expense_submission_id","created_at");--> statement-breakpoint
-- Expense history is append-only (FR-44 "every version is preserved", FR-51, CLAUDE.md constraint 6).
CREATE TRIGGER expense_revisions_append_only BEFORE UPDATE OR DELETE ON expense_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER expense_revisions_no_truncate BEFORE TRUNCATE ON expense_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER expense_decisions_append_only BEFORE UPDATE OR DELETE ON expense_decisions
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER expense_decisions_no_truncate BEFORE TRUNCATE ON expense_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER expense_payments_append_only BEFORE UPDATE OR DELETE ON expense_payments
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER expense_payments_no_truncate BEFORE TRUNCATE ON expense_payments
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
-- Receipt files and spending entries are removed or voided by marking them, never deleted.
CREATE TRIGGER expense_receipt_files_no_delete BEFORE DELETE ON expense_receipt_files
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER spending_entries_no_delete BEFORE DELETE ON spending_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
-- Only a draft that was never submitted can be deleted (as FR-05 for annual budgets).
CREATE FUNCTION expense_submissions_delete_draft_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' AND OLD.reference_number IS NULL THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'expense_submissions: only a never-submitted draft can be deleted'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER expense_submissions_delete_draft_only BEFORE DELETE ON expense_submissions
  FOR EACH ROW EXECUTE FUNCTION expense_submissions_delete_draft_only();
--> statement-breakpoint
-- Defaults from Requirements 6B.10.
INSERT INTO app_settings (key, value) VALUES
  ('claim_deadline_days', '90'),
  ('unclaimed_purchase_reminder_days', '60'),
  ('payment_reminder_days', '14'),
  ('board_reminder_days', '7')
ON CONFLICT (key) DO NOTHING;
