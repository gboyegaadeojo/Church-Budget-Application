CREATE TABLE "expense_submitters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "expense_submitters" ADD CONSTRAINT "expense_submitters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submitters" ADD CONSTRAINT "expense_submitters_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submitters" ADD CONSTRAINT "expense_submitters_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_submitters" ADD CONSTRAINT "expense_submitters_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_submitters_active_key" ON "expense_submitters" USING btree ("user_id","department_id") WHERE "expense_submitters"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "expense_submitters_department_idx" ON "expense_submitters" USING btree ("department_id");