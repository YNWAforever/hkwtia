CREATE TYPE "public"."public_profile_status" AS ENUM('hidden', 'pending_review', 'published', 'rejected');--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "listing_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tagline_en" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tagline_zh_hk" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "description_zh_hk" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "public_profile_status" "public_profile_status" DEFAULT 'hidden' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "public_profile_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "profile_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "profile_reviewed_by_profile_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "profile_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_profile_reviewed_by_profile_id_profiles_id_fk" FOREIGN KEY ("profile_reviewed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_unique" ON "companies" USING btree ("slug") WHERE "companies"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "companies_public_profile_idx" ON "companies" USING btree ("public_profile_status","display_name");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_identity_check" CHECK ("leads"."listing_id" IS NOT NULL OR "leads"."contact_id" IS NOT NULL);