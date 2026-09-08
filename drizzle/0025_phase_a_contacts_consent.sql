CREATE TYPE "public"."contact_source" AS ENUM('whatsapp', 'event_guest', 'showcase_intro', 'join_abandoned', 'interest_form', 'import');--> statement-breakpoint
CREATE TYPE "public"."contact_stage" AS ENUM('new', 'contacted', 'qualified', 'applied', 'member', 'closed');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text,
	"company_id" uuid,
	"display_name" text,
	"email" text,
	"phone_e164" text,
	"whatsapp_member_id" text,
	"source" "contact_source" NOT NULL,
	"stage" "contact_stage" DEFAULT 'new' NOT NULL,
	"owner_profile_id" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"whatsapp_consent_at" timestamp with time zone,
	"whatsapp_consent_source" text,
	"whatsapp_consent_text_version" text,
	"whatsapp_opted_out_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_identity_check" CHECK ("contacts"."email" IS NOT NULL OR "contacts"."phone_e164" IS NOT NULL OR "contacts"."whatsapp_member_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "site_announcements" DROP CONSTRAINT "site_announcements_href_check";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "whatsapp_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "whatsapp_consent_source" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "whatsapp_consent_text_version" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_phone_unique" ON "contacts" USING btree ("phone_e164") WHERE "contacts"."phone_e164" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_whatsapp_member_unique" ON "contacts" USING btree ("whatsapp_member_id") WHERE "contacts"."whatsapp_member_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_profile_unique" ON "contacts" USING btree ("profile_id") WHERE "contacts"."profile_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_stage_owner_idx" ON "contacts" USING btree ("stage","owner_profile_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
ALTER TABLE "site_announcements" ADD CONSTRAINT "site_announcements_href_check" CHECK ("site_announcements"."href" IN ('/', '/join', '/about', '/about/chairman', '/about/committees', '/about/history', '/membership', '/showcase', '/launchpad', '/ai-ops', '/events', '/news', '/programs/cpai', '/programs/hkict', '/programs/tct', '/programs/asa', '/programmes', '/contact', '/partners', '/privacy', '/ai-transparency'));