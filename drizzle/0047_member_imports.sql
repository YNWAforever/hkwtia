CREATE TABLE "member_import_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "file_digest" text NOT NULL,
  "format" text NOT NULL,
  "parsed_snapshot" jsonb NOT NULL,
  "row_count" integer NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "member_import_uploads_format_check" CHECK ("format" IN ('csv','xlsx')),
  CONSTRAINT "member_import_uploads_rows_check" CHECK ("row_count" >= 0 AND "row_count" <= 5000)
);
--> statement-breakpoint
CREATE INDEX "member_import_uploads_owner_created_idx" ON "member_import_uploads" ("actor_profile_id","created_at");
--> statement-breakpoint
CREATE TABLE "member_import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid NOT NULL REFERENCES "member_import_uploads"("id") ON DELETE RESTRICT,
  "actor_profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "file_digest" text NOT NULL,
  "mapping_digest" text NOT NULL,
  "mapping" jsonb NOT NULL,
  "state" text NOT NULL DEFAULT 'validated',
  "summary" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "confirmed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "member_import_runs_state_check" CHECK ("state" IN ('validated','confirmed','committed','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "member_import_runs_digest_unique" ON "member_import_runs" ("actor_profile_id","file_digest","mapping_digest");
--> statement-breakpoint
CREATE INDEX "member_import_runs_owner_created_idx" ON "member_import_runs" ("actor_profile_id","created_at");
--> statement-breakpoint
CREATE TABLE "member_import_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "member_import_runs"("id") ON DELETE RESTRICT,
  "row_number" integer NOT NULL,
  "validated_payload" jsonb NOT NULL,
  "before_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "validation_status" text NOT NULL,
  "match_target_id" text,
  "conflict_reason" text,
  "expected_version" text,
  "confirmed" boolean NOT NULL DEFAULT false,
  "batch_item_id" uuid REFERENCES "admin_batch_items"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "member_import_rows_status_check" CHECK ("validation_status" IN ('create','update','unchanged','duplicate','conflict','invalid'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "member_import_rows_number_unique" ON "member_import_rows" ("run_id","row_number");
--> statement-breakpoint
CREATE INDEX "member_import_rows_status_idx" ON "member_import_rows" ("run_id","validation_status");
--> statement-breakpoint
CREATE TABLE "member_operations_metadata" (
  "profile_id" text PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "owner_profile_id" text REFERENCES "profiles"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
