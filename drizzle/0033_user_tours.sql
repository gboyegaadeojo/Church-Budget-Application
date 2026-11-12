CREATE TABLE "user_tours" (
	"user_id" uuid NOT NULL,
	"tour" text NOT NULL,
	"outcome" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tours_user_id_tour_pk" PRIMARY KEY("user_id","tour"),
	CONSTRAINT "user_tours_tour" CHECK ("user_tours"."tour" in ('annual', 'expense')),
	CONSTRAINT "user_tours_outcome" CHECK ("user_tours"."outcome" in ('finished', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "user_tours" ADD CONSTRAINT "user_tours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;