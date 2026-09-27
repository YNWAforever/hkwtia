CREATE TABLE "admin_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "operation" text NOT NULL,
  "validated_payload" jsonb NOT NULL,
  "selection_snapshot" jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_digest" text NOT NULL,
  "state" text DEFAULT 'preparing' NOT NULL,
  "preview_digest" text,
  "preview_expires_at" timestamp with time zone,
  "preparation_lease_owner" text,
  "preparation_lease_expires_at" timestamp with time zone,
  "preparation_token" integer DEFAULT 0 NOT NULL,
  "counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "prepared_at" timestamp with time zone,
  "committed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_batches_state_check" CHECK ("state" IN ('preparing','ready','queued','running','completed','completed_with_errors','cancelled','expired')),
  CONSTRAINT "admin_batches_operation_check" CHECK ("operation" IN ('profile_patch','import_commit','membership_grant','renewal_reminder','profile_update_invite','ticket_resend','export_members'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_batches_actor_key_unique" ON "admin_batches" USING btree ("actor_profile_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "admin_batches_preparing_idx" ON "admin_batches" USING btree ("state", "preparation_lease_expires_at", "created_at");
--> statement-breakpoint
CREATE INDEX "admin_batches_owner_recent_idx" ON "admin_batches" USING btree ("actor_profile_id", "created_at");
--> statement-breakpoint
CREATE TABLE "admin_batch_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL REFERENCES "admin_batches"("id") ON DELETE RESTRICT,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "expected_version" text NOT NULL,
  "before_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "after_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "preview_status" text NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "lease_token" integer DEFAULT 0 NOT NULL,
  "effect_key" text NOT NULL UNIQUE,
  "result_ref" text,
  "error_code" text,
  "reason_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_batch_items_preview_check" CHECK ("preview_status" IN ('eligible','skipped','blocked')),
  CONSTRAINT "admin_batch_items_state_check" CHECK ("state" IN ('pending','running','succeeded','skipped','failed')),
  CONSTRAINT "admin_batch_items_attempt_check" CHECK ("attempt_count" >= 0 AND "lease_token" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_batch_items_target_unique" ON "admin_batch_items" USING btree ("batch_id", "target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "admin_batch_items_claim_idx" ON "admin_batch_items" USING btree ("state", "next_attempt_at", "lease_expires_at");
--> statement-breakpoint
CREATE INDEX "admin_batch_items_batch_state_idx" ON "admin_batch_items" USING btree ("batch_id", "state");
