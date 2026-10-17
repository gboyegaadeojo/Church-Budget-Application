CREATE TABLE "expense_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_submission_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"acting_role" "role" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_messages_body_length" CHECK (btrim("expense_messages"."body") <> '' and char_length("expense_messages"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "expense_messages" ADD CONSTRAINT "expense_messages_expense_submission_id_expense_submissions_id_fk" FOREIGN KEY ("expense_submission_id") REFERENCES "public"."expense_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_messages" ADD CONSTRAINT "expense_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_messages_expense_idx" ON "expense_messages" USING btree ("expense_submission_id","created_at");--> statement-breakpoint
CREATE INDEX "expense_messages_author_idx" ON "expense_messages" USING btree ("author_user_id","created_at");--> statement-breakpoint
-- 6B.4: messages can't be edited or deleted after sending.
CREATE TRIGGER expense_messages_append_only BEFORE UPDATE OR DELETE ON expense_messages
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER expense_messages_no_truncate BEFORE TRUNCATE ON expense_messages
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
