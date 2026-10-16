CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" char(64) NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_assets_kind" CHECK ("brand_assets"."kind" in ('logo', 'icon')),
	CONSTRAINT "brand_assets_type" CHECK ("brand_assets"."content_type" in ('image/png', 'image/jpeg', 'image/svg+xml')),
	CONSTRAINT "brand_assets_size" CHECK ("brand_assets"."byte_size" > 0 and "brand_assets"."byte_size" <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- FR-30: an uploaded logo is never changed or deleted; a replacement is a new row.
CREATE TRIGGER brand_assets_append_only BEFORE UPDATE OR DELETE ON brand_assets
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
--> statement-breakpoint
CREATE TRIGGER brand_assets_no_truncate BEFORE TRUNCATE ON brand_assets
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
