CREATE TYPE "public"."access_status" AS ENUM('active', 'suspended_not_leader', 'pending_department', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('user', 'system', 'job');--> statement-breakpoint
CREATE TYPE "public"."annual_status" AS ENUM('draft', 'submitted', 'updated', 'in_review', 'returned', 'awaiting_second_approval', 'approved', 'declined', 'closed');--> statement-breakpoint
CREATE TYPE "public"."approval_method" AS ENUM('as_requested', 'different_amount', 'line_changes');--> statement-breakpoint
CREATE TYPE "public"."audit_area" AS ENUM('annual', 'expenses', 'spending', 'admin', 'access');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."decision_email_mode" AS ENUM('immediate', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('approved', 'returned', 'declined', 'reopened', 'second_approved', 'second_refused');--> statement-breakpoint
CREATE TYPE "public"."decision_stage" AS ENUM('first', 'second');--> statement-breakpoint
CREATE TYPE "public"."department_status" AS ENUM('active', 'inactive', 'proposed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pco_mapping_mode" AS ENUM('suggest', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."pco_match_status" AS ENUM('suggested', 'confirmed', 'no_longer_leader', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."pco_source_type" AS ENUM('services_team', 'groups_group', 'groups_tag', 'people_field_value');--> statement-breakpoint
CREATE TYPE "public"."representative_source" AS ENUM('manual', 'form_pick', 'pco_mapping');--> statement-breakpoint
CREATE TYPE "public"."representative_type" AS ENUM('primary', 'backup', 'representative');--> statement-breakpoint
CREATE TYPE "public"."revision_kind" AS ENUM('submission', 'revision', 'clarification_response');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('requester', 'accountant', 'backup_approver', 'board_chair', 'vice_chair', 'church_admin', 'system_admin');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_decision_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_adjustments_approval_decision_id_unique" UNIQUE("approval_decision_id"),
	CONSTRAINT "approval_adjustments_reason_required" CHECK (btrim("approval_adjustments"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"request_revision_id" uuid NOT NULL,
	"decision" "decision" NOT NULL,
	"method" "approval_method",
	"decision_stage" "decision_stage" DEFAULT 'first' NOT NULL,
	"approved_subtotal_cents" bigint,
	"approved_tax_cents" bigint,
	"approved_total_cents" bigint,
	"decision_reason" text,
	"board_reference" text,
	"approver_user_id" uuid NOT NULL,
	"acting_role" "role" NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decisions_amounts_reconcile" CHECK (("approval_decisions"."approved_subtotal_cents" is null and "approval_decisions"."approved_tax_cents" is null and "approval_decisions"."approved_total_cents" is null)
        or ("approval_decisions"."approved_subtotal_cents" >= 0 and "approval_decisions"."approved_tax_cents" >= 0
            and "approval_decisions"."approved_total_cents" = "approval_decisions"."approved_subtotal_cents" + "approval_decisions"."approved_tax_cents")),
	CONSTRAINT "approval_decisions_approval_has_amounts" CHECK (("approval_decisions"."decision" in ('approved', 'second_approved')) = ("approval_decisions"."approved_total_cents" is not null)),
	CONSTRAINT "approval_decisions_approval_has_method" CHECK (("approval_decisions"."decision" = 'approved') = ("approval_decisions"."method" is not null)),
	CONSTRAINT "approval_decisions_reason_required" CHECK ("approval_decisions"."decision" in ('second_approved')
        or ("approval_decisions"."decision" = 'approved' and "approval_decisions"."method" <> 'different_amount')
        or coalesce(btrim("approval_decisions"."decision_reason"), '') <> '')
);
--> statement-breakpoint
CREATE TABLE "approved_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_decision_id" uuid NOT NULL,
	"budget_line_item_id" uuid NOT NULL,
	"approved_quantity" integer,
	"approved_unit_price_cents" bigint,
	"approved_line_total_cents" bigint NOT NULL,
	"adjustment_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_line_items_decision_line_key" UNIQUE("approval_decision_id","budget_line_item_id"),
	CONSTRAINT "approved_line_items_total_non_negative" CHECK ("approved_line_items"."approved_line_total_cents" >= 0),
	CONSTRAINT "approved_line_items_total_reconciles" CHECK (("approved_line_items"."approved_quantity" is null and "approved_line_items"."approved_unit_price_cents" is null)
        or ("approved_line_items"."approved_quantity" >= 0 and "approved_line_items"."approved_unit_price_cents" >= 0
            and "approved_line_items"."approved_line_total_cents" = "approved_line_items"."approved_quantity"::bigint * "approved_line_items"."approved_unit_price_cents"))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" "actor_kind" NOT NULL,
	"acting_role" "role",
	"area" "audit_area" NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"budget_request_id" uuid,
	"department_id" uuid,
	"cycle_id" uuid,
	"event_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"details" jsonb,
	"request_ip_hash" text,
	CONSTRAINT "audit_events_user_has_actor" CHECK (("audit_events"."actor_kind" = 'user') = ("audit_events"."actor_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "budget_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"budget_year" integer NOT NULL,
	"start_date" date NOT NULL,
	"submission_deadline" timestamp with time zone NOT NULL,
	"status" "cycle_status" DEFAULT 'draft' NOT NULL,
	"currency" char(3) DEFAULT 'CAD' NOT NULL,
	"default_tax_rate" numeric(5, 4) NOT NULL,
	"decision_email_mode" "decision_email_mode" DEFAULT 'immediate' NOT NULL,
	"decision_release_at" timestamp with time zone,
	"release_message" text,
	"board_total_cents" bigint,
	"board_reference" text,
	"spending_period_end" date,
	"spending_locked_at" timestamp with time zone,
	"spending_locked_by_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_cycles_budget_year_unique" UNIQUE("budget_year"),
	CONSTRAINT "budget_cycles_currency_cad" CHECK ("budget_cycles"."currency" = 'CAD'),
	CONSTRAINT "budget_cycles_tax_rate_range" CHECK ("budget_cycles"."default_tax_rate" >= 0 and "budget_cycles"."default_tax_rate" <= 1),
	CONSTRAINT "budget_cycles_board_total_positive" CHECK ("budget_cycles"."board_total_cents" is null or "budget_cycles"."board_total_cents" >= 0),
	CONSTRAINT "budget_cycles_scheduled_release_has_time" CHECK ("budget_cycles"."decision_email_mode" = 'immediate' or "budget_cycles"."decision_release_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "budget_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"line_total_cents" bigint NOT NULL,
	"product_url" text,
	"notes" text,
	"sort_order" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_line_items_quantity_range" CHECK ("budget_line_items"."quantity" between 1 and 10000),
	CONSTRAINT "budget_line_items_unit_price_range" CHECK ("budget_line_items"."unit_price_cents" between 0 and 100000000),
	CONSTRAINT "budget_line_items_total_reconciles" CHECK ("budget_line_items"."line_total_cents" = "budget_line_items"."quantity"::bigint * "budget_line_items"."unit_price_cents"),
	CONSTRAINT "budget_line_items_url_http" CHECK ("budget_line_items"."product_url" is null or "budget_line_items"."product_url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "budget_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_number" text,
	"budget_cycle_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"department_name_snapshot" text NOT NULL,
	"title" text NOT NULL,
	"justification" text DEFAULT '' NOT NULL,
	"status" "annual_status" DEFAULT 'draft' NOT NULL,
	"tax_rate" numeric(5, 4),
	"requested_subtotal_cents" bigint,
	"requested_tax_cents" bigint,
	"requested_total_cents" bigint,
	"approved_subtotal_cents" bigint,
	"approved_tax_cents" bigint,
	"approved_total_cents" bigint,
	"edit_count" integer DEFAULT 0 NOT NULL,
	"extra_edits_allowed" integer DEFAULT 0 NOT NULL,
	"version_number" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_requests_reference_number_unique" UNIQUE("reference_number"),
	CONSTRAINT "budget_requests_cycle_department_key" UNIQUE("budget_cycle_id","department_id"),
	CONSTRAINT "budget_requests_requested_reconciles" CHECK (("budget_requests"."requested_subtotal_cents" is null and "budget_requests"."requested_tax_cents" is null and "budget_requests"."requested_total_cents" is null)
        or ("budget_requests"."requested_subtotal_cents" >= 0 and "budget_requests"."requested_tax_cents" >= 0
            and "budget_requests"."requested_total_cents" = "budget_requests"."requested_subtotal_cents" + "budget_requests"."requested_tax_cents")),
	CONSTRAINT "budget_requests_approved_reconciles" CHECK (("budget_requests"."approved_subtotal_cents" is null and "budget_requests"."approved_tax_cents" is null and "budget_requests"."approved_total_cents" is null)
        or ("budget_requests"."approved_subtotal_cents" >= 0 and "budget_requests"."approved_tax_cents" >= 0
            and "budget_requests"."approved_total_cents" = "budget_requests"."approved_subtotal_cents" + "budget_requests"."approved_tax_cents")),
	CONSTRAINT "budget_requests_submitted_has_snapshot" CHECK ("budget_requests"."status" = 'draft' or ("budget_requests"."tax_rate" is not null and "budget_requests"."requested_total_cents" is not null
        and "budget_requests"."reference_number" is not null and "budget_requests"."submitted_at" is not null)),
	CONSTRAINT "budget_requests_approved_has_amounts" CHECK ("budget_requests"."status" not in ('approved', 'closed') or "budget_requests"."approved_total_cents" is not null),
	CONSTRAINT "budget_requests_tax_rate_range" CHECK ("budget_requests"."tax_rate" is null or ("budget_requests"."tax_rate" >= 0 and "budget_requests"."tax_rate" <= 1)),
	CONSTRAINT "budget_requests_edit_limit" CHECK ("budget_requests"."edit_count" >= 0 and "budget_requests"."extra_edits_allowed" >= 0 and "budget_requests"."edit_count" <= 2 + "budget_requests"."extra_edits_allowed")
);
--> statement-breakpoint
CREATE TABLE "deadline_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"new_deadline" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "department_status" DEFAULT 'active' NOT NULL,
	"proposed_by_user_id" uuid,
	"merged_into_department_id" uuid,
	"pco_source_type" "pco_source_type",
	"pco_source_id" text,
	"pco_source_name" text,
	"pco_mapping_mode" "pco_mapping_mode" DEFAULT 'suggest' NOT NULL,
	"pco_leaders_count_as_group_leaders" boolean DEFAULT false NOT NULL,
	"pco_last_synced_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_length" CHECK (char_length("departments"."name") between 1 and 80),
	CONSTRAINT "departments_pco_source_complete" CHECK (("departments"."pco_source_type" is null) = ("departments"."pco_source_id" is null))
);
--> statement-breakpoint
CREATE TABLE "reference_sequences" (
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "reference_sequences_kind_year_pk" PRIMARY KEY("kind","year")
);
--> statement-breakpoint
CREATE TABLE "request_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"kind" "revision_kind" NOT NULL,
	"edited_by_user_id" uuid NOT NULL,
	"change_summary" text,
	"tax_rate" numeric(5, 4) NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"request_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_revisions_request_number_key" UNIQUE("budget_request_id","revision_number"),
	CONSTRAINT "request_revisions_reconciles" CHECK ("request_revisions"."subtotal_cents" >= 0 and "request_revisions"."tax_cents" >= 0 and "request_revisions"."total_cents" = "request_revisions"."subtotal_cents" + "request_revisions"."tax_cents")
);
--> statement-breakpoint
CREATE TABLE "user_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"representative_type" "representative_type" DEFAULT 'representative' NOT NULL,
	"source" "representative_source" DEFAULT 'manual' NOT NULL,
	"pco_status" "pco_match_status",
	"pco_last_seen_at" timestamp with time zone,
	"away_from" timestamp with time zone,
	"away_until" timestamp with time zone,
	"assigned_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_departments_user_department_key" UNIQUE("user_id","department_id"),
	CONSTRAINT "user_departments_away_primary_only" CHECK (("user_departments"."away_from" is null and "user_departments"."away_until" is null) or "user_departments"."representative_type" = 'primary')
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"google_subject_id" text,
	"pco_person_id" text,
	"pco_leader_verified" boolean DEFAULT false NOT NULL,
	"pco_verified_at" timestamp with time zone,
	"pco_field_value_snapshot" text,
	"access_status" "access_status" DEFAULT 'pending_department' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_subject_id_unique" UNIQUE("google_subject_id"),
	CONSTRAINT "users_pco_person_id_unique" UNIQUE("pco_person_id")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_adjustments" ADD CONSTRAINT "approval_adjustments_approval_decision_id_approval_decisions_id_fk" FOREIGN KEY ("approval_decision_id") REFERENCES "public"."approval_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_adjustments" ADD CONSTRAINT "approval_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_revision_id_request_revisions_id_fk" FOREIGN KEY ("request_revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_line_items" ADD CONSTRAINT "approved_line_items_approval_decision_id_approval_decisions_id_fk" FOREIGN KEY ("approval_decision_id") REFERENCES "public"."approval_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_line_items" ADD CONSTRAINT "approved_line_items_budget_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("budget_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_spending_locked_by_user_id_users_id_fk" FOREIGN KEY ("spending_locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_budget_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("budget_cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_requests" ADD CONSTRAINT "budget_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_cycle_id_budget_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."budget_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_merged_into_department_id_departments_id_fk" FOREIGN KEY ("merged_into_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_decisions_request_idx" ON "approval_decisions" USING btree ("budget_request_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" USING btree ("event_timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_area_type_idx" ON "audit_events" USING btree ("area","event_type");--> statement-breakpoint
CREATE INDEX "audit_events_department_cycle_idx" ON "audit_events" USING btree ("department_id","cycle_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "budget_line_items_request_idx" ON "budget_line_items" USING btree ("budget_request_id","sort_order");--> statement-breakpoint
CREATE INDEX "budget_requests_cycle_status_idx" ON "budget_requests" USING btree ("budget_cycle_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_extensions_one_active" ON "deadline_extensions" USING btree ("cycle_id","department_id") WHERE "deadline_extensions"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_name_lower_key" ON "departments" USING btree (lower("name")) WHERE "departments"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "user_departments_one_primary" ON "user_departments" USING btree ("department_id") WHERE "user_departments"."representative_type" = 'primary';--> statement-breakpoint
CREATE UNIQUE INDEX "user_departments_one_backup" ON "user_departments" USING btree ("department_id") WHERE "user_departments"."representative_type" = 'backup';--> statement-breakpoint
CREATE INDEX "user_departments_department_idx" ON "user_departments" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));