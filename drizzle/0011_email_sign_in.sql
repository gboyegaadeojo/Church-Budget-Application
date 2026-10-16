CREATE TABLE "email_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"request_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_login_codes_attempts_non_negative" CHECK ("email_login_codes"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_login_codes" ADD CONSTRAINT "email_login_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_login_codes_email_idx" ON "email_login_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "email_login_codes_ip_idx" ON "email_login_codes" USING btree ("request_ip_hash","created_at");--> statement-breakpoint
-- FR-01b: "Allow email sign-in", on by default (src/domain/settings holds the same default).
INSERT INTO app_settings (key, value) VALUES ('signin_email_enabled', 'true') ON CONFLICT (key) DO NOTHING;
