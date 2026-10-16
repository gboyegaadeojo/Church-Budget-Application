CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"away_from" timestamp with time zone,
	"away_until" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_away_dates" CHECK (("user_preferences"."away_from" is not null or "user_preferences"."away_until" is null)
        and ("user_preferences"."away_until" is null or "user_preferences"."away_until" > "user_preferences"."away_from"))
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;