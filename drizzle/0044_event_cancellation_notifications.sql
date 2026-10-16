CREATE TABLE "event_cancellation_intents" (
  "event_id" uuid PRIMARY KEY NOT NULL REFERENCES "events"("id") ON DELETE RESTRICT,
  "revision" integer DEFAULT 1 NOT NULL,
  "cancelled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_profile_id" text NOT NULL,
  CONSTRAINT "event_cancellation_intents_revision_check" CHECK ("revision" = 1)
);
--> statement-breakpoint
CREATE TABLE "event_cancellation_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "event_cancellation_intents"("event_id") ON DELETE RESTRICT,
  "revision" integer DEFAULT 1 NOT NULL,
  "registration_kind" text NOT NULL,
  "registration_id" text NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "recipient_name" text NOT NULL,
  "recipient_email" text,
  "recipient_locale" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "payload" jsonb,
  "idempotency_key" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claim_expires_at" timestamp with time zone,
  "first_attempt_at" timestamp with time zone,
  "provider_id" text,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_cancellation_notifications_kind_check" CHECK ("registration_kind" IN ('member', 'guest')),
  CONSTRAINT "event_cancellation_notifications_channel_check" CHECK ("channel" = 'email'),
  CONSTRAINT "event_cancellation_notifications_status_check" CHECK ("status" IN ('pending', 'queued', 'sending', 'accepted', 'blocked', 'failed', 'uncertain')),
  CONSTRAINT "event_cancellation_notifications_attempt_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "event_cancellation_notifications_scope_unique" UNIQUE("event_id", "revision", "registration_kind", "registration_id", "channel"),
  CONSTRAINT "event_cancellation_notifications_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "event_cancellation_notifications_due_idx" ON "event_cancellation_notifications" USING btree ("status", "next_attempt_at", "claim_expires_at");
--> statement-breakpoint
CREATE TABLE "email_address_blocks" (
  "email" text PRIMARY KEY NOT NULL,
  "reason_code" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "email_address_blocks_reason_check" CHECK ("reason_code" IN ('hard_bounce', 'invalid_address', 'manual')),
  CONSTRAINT "email_address_blocks_lowercase_check" CHECK ("email" = lower("email"))
);
