CREATE TABLE "organisation_application_details" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"tier_code" text NOT NULL,
	"primary_name" text NOT NULL,
	"primary_email" text NOT NULL,
	"primary_phone" text,
	"secondary_name" text NOT NULL,
	"secondary_email" text NOT NULL,
	"secondary_phone" text,
	"br_file_name" text NOT NULL,
	"br_content_type" text NOT NULL,
	"br_byte_size" integer NOT NULL,
	"br_sha256" text NOT NULL,
	"br_storage_key" text,
	"br_storage_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_application_tier_check" CHECK ("organisation_application_details"."tier_code" IN ('corporate', 'patron')),
	CONSTRAINT "organisation_application_br_status_check" CHECK ("organisation_application_details"."br_storage_status" IN ('stored', 'pending_provider')),
	CONSTRAINT "organisation_application_br_type_check" CHECK ("organisation_application_details"."br_content_type" IN ('application/pdf', 'image/jpeg', 'image/png')),
	CONSTRAINT "organisation_application_br_size_check" CHECK ("organisation_application_details"."br_byte_size" BETWEEN 1 AND 8388608),
	CONSTRAINT "organisation_application_br_sha_check" CHECK ("organisation_application_details"."br_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "organisation_application_br_key_check" CHECK (("organisation_application_details"."br_storage_status" = 'stored' AND "organisation_application_details"."br_storage_key" IS NOT NULL) OR ("organisation_application_details"."br_storage_status" = 'pending_provider' AND "organisation_application_details"."br_storage_key" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "organisation_application_details" ADD CONSTRAINT "organisation_application_details_application_id_membership_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."membership_applications"("id") ON DELETE cascade ON UPDATE no action;
