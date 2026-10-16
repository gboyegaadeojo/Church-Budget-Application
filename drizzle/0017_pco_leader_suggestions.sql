CREATE TABLE "pco_leader_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pco_leader_suggestions_department_user_key" UNIQUE("department_id","user_id"),
	CONSTRAINT "pco_leader_suggestions_status" CHECK ("pco_leader_suggestions"."status" in ('suggested', 'added', 'ignored', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "pco_leader_suggestions" ADD CONSTRAINT "pco_leader_suggestions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_leader_suggestions" ADD CONSTRAINT "pco_leader_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_leader_suggestions" ADD CONSTRAINT "pco_leader_suggestions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- FR-39: a suggestion and the administrator's decision on it are kept, never deleted.
CREATE TRIGGER pco_leader_suggestions_no_delete BEFORE DELETE ON pco_leader_suggestions
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER pco_leader_suggestions_no_truncate BEFORE TRUNCATE ON pco_leader_suggestions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
