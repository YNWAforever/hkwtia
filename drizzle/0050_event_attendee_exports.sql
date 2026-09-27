ALTER TABLE "admin_batches" DROP CONSTRAINT "admin_batches_operation_check";
--> statement-breakpoint
ALTER TABLE "admin_batches" ADD CONSTRAINT "admin_batches_operation_check" CHECK ("operation" IN ('profile_patch','import_commit','membership_grant','renewal_reminder','profile_update_invite','ticket_resend','export_members','export_event_attendees'));
--> statement-breakpoint
CREATE TABLE "admin_batch_export_artifacts" (
  "batch_id" uuid PRIMARY KEY REFERENCES "admin_batches"("id") ON DELETE RESTRICT,
  "csv" text NOT NULL,
  "row_count" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "admin_batch_export_artifacts_bounds" CHECK ("row_count" BETWEEN 1 AND 5000 AND octet_length("csv") <= 10485760)
);
--> statement-breakpoint
CREATE INDEX "admin_batch_export_artifacts_expiry_idx" ON "admin_batch_export_artifacts" ("expires_at");
