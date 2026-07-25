CREATE TYPE "public"."journey_status" AS ENUM('scheduled', 'processing', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."staff_task_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "journey_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"membership_id" uuid,
	"journey" text NOT NULL,
	"instance_key" text NOT NULL,
	"step" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "journey_status" DEFAULT 'scheduled' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"delivery_key" text NOT NULL,
	"error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_state_profile_instance_step_unique" UNIQUE("profile_id","journey","instance_key","step"),
	CONSTRAINT "journey_state_delivery_key_unique" UNIQUE("delivery_key")
);
--> statement-breakpoint
CREATE TABLE "message_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"channel" text NOT NULL,
	"classification" text NOT NULL,
	"reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_suppressions_profile_channel_classification_unique" UNIQUE("profile_id","channel","classification")
);
--> statement-breakpoint
CREATE TABLE "staff_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"journey_state_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"summary_code" text NOT NULL,
	"status" "staff_task_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_tasks_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text,
	"journey_state_id" uuid,
	"template" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"idempotency_key" text NOT NULL,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"classification" text DEFAULT 'transactional' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_log_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "journey_state_id" uuid;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "idempotency_key" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "locale" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "classification" text DEFAULT 'transactional' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "whatsapp_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "journey_state" ADD CONSTRAINT "journey_state_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_state" ADD CONSTRAINT "journey_state_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_suppressions" ADD CONSTRAINT "message_suppressions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_journey_state_id_journey_state_id_fk" FOREIGN KEY ("journey_state_id") REFERENCES "public"."journey_state"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_resolved_by_profile_id_profiles_id_fk" FOREIGN KEY ("resolved_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_log" ADD CONSTRAINT "whatsapp_log_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_log" ADD CONSTRAINT "whatsapp_log_journey_state_id_journey_state_id_fk" FOREIGN KEY ("journey_state_id") REFERENCES "public"."journey_state"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_state_due_idx" ON "journey_state" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "journey_state_profile_idx" ON "journey_state" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "message_suppressions_profile_idx" ON "message_suppressions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "staff_tasks_profile_status_idx" ON "staff_tasks" USING btree ("profile_id","status");--> statement-breakpoint
CREATE INDEX "staff_tasks_journey_state_idx" ON "staff_tasks" USING btree ("journey_state_id");--> statement-breakpoint
CREATE INDEX "whatsapp_log_profile_created_idx" ON "whatsapp_log" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_log_journey_state_idx" ON "whatsapp_log" USING btree ("journey_state_id");--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_journey_state_id_journey_state_id_fk" FOREIGN KEY ("journey_state_id") REFERENCES "public"."journey_state"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_journey_state_idx" ON "email_log" USING btree ("journey_state_id");--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_idempotency_key_unique" UNIQUE("idempotency_key");