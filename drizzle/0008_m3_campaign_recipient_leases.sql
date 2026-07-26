ALTER TYPE "public"."campaign_recipient_status" ADD VALUE 'processing' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "error_code" text;--> statement-breakpoint
CREATE INDEX "campaign_recipients_due_idx" ON "campaign_recipients" USING btree ("status","claim_expires_at");