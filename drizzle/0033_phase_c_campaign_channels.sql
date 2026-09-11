ALTER TYPE "public"."campaign_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'review';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'scheduled';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'sending';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'failed';--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"element_name" text NOT NULL,
	"language_code" text NOT NULL,
	"category" text DEFAULT 'utility' NOT NULL,
	"variables" text[] DEFAULT '{}'::text[] NOT NULL,
	"previews" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"reviewed_by_profile_id" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_templates_status_check" CHECK ("whatsapp_templates"."status" IN ('pending', 'approved', 'rejected', 'disabled')),
	CONSTRAINT "whatsapp_templates_category_check" CHECK ("whatsapp_templates"."category" IN ('marketing', 'utility', 'authentication')),
	CONSTRAINT "whatsapp_templates_approved_at_check" CHECK ("whatsapp_templates"."status" <> 'approved' OR "whatsapp_templates"."approved_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" DROP CONSTRAINT "campaign_recipients_campaign_profile_unique";--> statement-breakpoint
ALTER TABLE "campaign_recipients" ALTER COLUMN "profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "template" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "variables_template" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reviewed_by_profile_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_log" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_reviewed_by_profile_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_element_language_unique" ON "whatsapp_templates" USING btree ("element_name","language_code");--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_key_whatsapp_templates_key_fk" FOREIGN KEY ("template_key") REFERENCES "public"."whatsapp_templates"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_reviewed_by_profile_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_log" ADD CONSTRAINT "whatsapp_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_campaign_profile_idx" ON "campaign_recipients" USING btree ("campaign_id","profile_id") WHERE "campaign_recipients"."profile_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_campaign_contact_idx" ON "campaign_recipients" USING btree ("campaign_id","contact_id") WHERE "campaign_recipients"."contact_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_recipients_campaign_status_idx" ON "campaign_recipients" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaign_recipients_provider_message_idx" ON "campaign_recipients" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_scheduled_idx" ON "campaigns" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "email_log_contact_created_idx" ON "email_log" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_log_contact_created_idx" ON "whatsapp_log" USING btree ("contact_id","created_at");--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_identity_check" CHECK (("campaign_recipients"."profile_id" IS NOT NULL) <> ("campaign_recipients"."contact_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_check" CHECK ("campaigns"."channel" IN ('email', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_template_check" CHECK ("campaigns"."channel" <> 'whatsapp' OR "campaigns"."template_key" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_email_template_check" CHECK ("campaigns"."channel" <> 'email' OR "campaigns"."template" IS NOT NULL);