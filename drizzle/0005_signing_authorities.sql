CREATE TABLE "signing_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"active_from" date NOT NULL,
	"active_until" date,
	"removed_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signing_authorities_name_length" CHECK (char_length("signing_authorities"."name") between 1 and 100),
	CONSTRAINT "signing_authorities_dates" CHECK ("signing_authorities"."active_until" is null or "signing_authorities"."active_until" >= "signing_authorities"."active_from")
);
--> statement-breakpoint
ALTER TABLE "signing_authorities" ADD CONSTRAINT "signing_authorities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Signers stay on past payments, so they are never deleted (FR-53, CLAUDE.md constraint 6).
-- Removing a signer sets active_until instead. Updates stay allowed (name fixes, removal).
CREATE TRIGGER signing_authorities_no_delete BEFORE DELETE ON signing_authorities
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();--> statement-breakpoint
CREATE TRIGGER signing_authorities_no_truncate BEFORE TRUNCATE ON signing_authorities
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();