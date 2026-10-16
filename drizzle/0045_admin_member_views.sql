CREATE TABLE "admin_member_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "filter_version" integer DEFAULT 1 NOT NULL,
  "query" jsonb NOT NULL,
  "shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_member_views_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "admin_member_views_filter_version_check" CHECK ("filter_version" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_member_views_owner_name_unique" ON "admin_member_views" USING btree ("owner_profile_id", "name");
--> statement-breakpoint
CREATE INDEX "admin_member_views_shared_updated_idx" ON "admin_member_views" USING btree ("shared", "updated_at");
