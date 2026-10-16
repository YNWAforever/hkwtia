CREATE TYPE "public"."event_format" AS ENUM('in_person', 'online', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('public', 'members_only', 'invite_only');--> statement-breakpoint
CREATE TYPE "public"."guest_registration_status" AS ENUM('registered', 'waitlist', 'cancelled', 'attended');--> statement-breakpoint
CREATE TYPE "public"."registration_mode" AS ENUM('rsvp', 'external', 'ticketed');--> statement-breakpoint
CREATE TABLE "event_guest_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"contact_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"whatsapp_number" text,
	"organisation" text,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"status" "guest_registration_status" DEFAULT 'registered' NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"cancel_token_digest" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"checked_in_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organiser_company_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "submitted_by_profile_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "status" "event_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visibility" "event_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "format" "event_format" DEFAULT 'in_person' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "online_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "registration_mode" "registration_mode" DEFAULT 'rsvp' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_registration_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reviewed_by_profile_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "event_guest_registrations" ADD CONSTRAINT "event_guest_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guest_registrations" ADD CONSTRAINT "event_guest_registrations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_guest_registrations_event_email_unique" ON "event_guest_registrations" USING btree ("event_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "event_guest_registrations_idempotency_unique" ON "event_guest_registrations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "event_guest_registrations_event_status_idx" ON "event_guest_registrations" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organiser_company_id_companies_id_fk" FOREIGN KEY ("organiser_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_submitted_by_profile_id_profiles_id_fk" FOREIGN KEY ("submitted_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_reviewed_by_profile_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_status_visibility_starts_idx" ON "events" USING btree ("status","visibility","starts_at");--> statement-breakpoint
CREATE INDEX "events_organiser_idx" ON "events" USING btree ("organiser_company_id","submitted_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_online_url_check" CHECK ("events"."format" = 'in_person' OR "events"."online_url" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_external_registration_check" CHECK ("events"."registration_mode" <> 'external' OR "events"."external_registration_url" IS NOT NULL);