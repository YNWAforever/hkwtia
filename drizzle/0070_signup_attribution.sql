-- Signup attribution. Apply this file before deploying the code that writes these columns.
-- The application and contact reads select the new columns, so a deploy without this
-- migration fails closed instead of dropping the source.
-- Independent of 0066, 0067, and 0068. Do not edit those files.
-- Do not apply this migration to production or to the shared staging database from the change that adds it.
-- Disposable test databases apply the journal in order.
ALTER TABLE "contacts" ADD COLUMN "utm_source" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "utm_medium" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "utm_campaign" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "utm_term" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "utm_content" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "referral_code" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "referrer_host" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "landing_path" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "heard_about" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "attribution_captured_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "utm_source" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "utm_medium" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "utm_campaign" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "utm_term" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "utm_content" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "referral_code" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "referrer_host" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "landing_path" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "heard_about" text;
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "attribution_captured_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_utm_source_len" CHECK ("contacts"."utm_source" IS NULL OR char_length("contacts"."utm_source") <= 80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_utm_medium_len" CHECK ("contacts"."utm_medium" IS NULL OR char_length("contacts"."utm_medium") <= 80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_utm_campaign_len" CHECK ("contacts"."utm_campaign" IS NULL OR char_length("contacts"."utm_campaign") <= 80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_utm_term_len" CHECK ("contacts"."utm_term" IS NULL OR char_length("contacts"."utm_term") <= 80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_utm_content_len" CHECK ("contacts"."utm_content" IS NULL OR char_length("contacts"."utm_content") <= 80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_referral_code_len" CHECK ("contacts"."referral_code" IS NULL OR char_length("contacts"."referral_code") <= 80);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_referrer_host_len" CHECK ("contacts"."referrer_host" IS NULL OR char_length("contacts"."referrer_host") <= 253);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_landing_path_len" CHECK ("contacts"."landing_path" IS NULL OR (char_length("contacts"."landing_path") <= 200 AND "contacts"."landing_path" ~ '^/'));
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_heard_about_len" CHECK ("contacts"."heard_about" IS NULL OR char_length("contacts"."heard_about") <= 200);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_utm_source_len" CHECK ("membership_applications"."utm_source" IS NULL OR char_length("membership_applications"."utm_source") <= 80);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_utm_medium_len" CHECK ("membership_applications"."utm_medium" IS NULL OR char_length("membership_applications"."utm_medium") <= 80);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_utm_campaign_len" CHECK ("membership_applications"."utm_campaign" IS NULL OR char_length("membership_applications"."utm_campaign") <= 80);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_utm_term_len" CHECK ("membership_applications"."utm_term" IS NULL OR char_length("membership_applications"."utm_term") <= 80);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_utm_content_len" CHECK ("membership_applications"."utm_content" IS NULL OR char_length("membership_applications"."utm_content") <= 80);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_referral_code_len" CHECK ("membership_applications"."referral_code" IS NULL OR char_length("membership_applications"."referral_code") <= 80);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_referrer_host_len" CHECK ("membership_applications"."referrer_host" IS NULL OR char_length("membership_applications"."referrer_host") <= 253);
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_landing_path_len" CHECK ("membership_applications"."landing_path" IS NULL OR (char_length("membership_applications"."landing_path") <= 200 AND "membership_applications"."landing_path" ~ '^/'));
--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_heard_about_len" CHECK ("membership_applications"."heard_about" IS NULL OR char_length("membership_applications"."heard_about") <= 200);
