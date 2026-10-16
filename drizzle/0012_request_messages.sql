CREATE TABLE "request_message_reads" (
	"user_id" uuid NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_message_reads_user_id_budget_request_id_pk" PRIMARY KEY("user_id","budget_request_id")
);
--> statement-breakpoint
CREATE TABLE "request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_request_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"acting_role" "role" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_messages_body_length" CHECK (btrim("request_messages"."body") <> '' and char_length("request_messages"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "request_message_reads" ADD CONSTRAINT "request_message_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_message_reads" ADD CONSTRAINT "request_message_reads_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_budget_request_id_budget_requests_id_fk" FOREIGN KEY ("budget_request_id") REFERENCES "public"."budget_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_messages_request_idx" ON "request_messages" USING btree ("budget_request_id","created_at");--> statement-breakpoint
CREATE INDEX "request_messages_author_idx" ON "request_messages" USING btree ("author_user_id","created_at");--> statement-breakpoint
-- FR-31: messages can't be edited or deleted after sending.
CREATE TRIGGER request_messages_append_only BEFORE UPDATE OR DELETE ON request_messages
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER request_messages_no_truncate BEFORE TRUNCATE ON request_messages
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
