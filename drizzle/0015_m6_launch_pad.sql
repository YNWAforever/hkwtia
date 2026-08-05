CREATE TYPE "public"."cohort_application_stage" AS ENUM('applied', 'accepted', 'ready', 'match', 'land', 'scale', 'graduated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."cohort_status" AS ENUM('planning', 'open', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."landing_partner_mou_status" AS ENUM('prospect', 'in_discussion', 'signed', 'inactive');--> statement-breakpoint
CREATE TABLE "cohort_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"stage" "cohort_application_stage" DEFAULT 'applied' NOT NULL,
	"readiness" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_zh_hk" text NOT NULL,
	"description_en" text NOT NULL,
	"description_zh_hk" text NOT NULL,
	"track" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"capacity" integer NOT NULL,
	"fee_hkd" integer NOT NULL,
	"status" "cohort_status" DEFAULT 'planning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohorts_capacity_check" CHECK ("cohorts"."capacity" > 0),
	CONSTRAINT "cohorts_fee_hkd_check" CHECK ("cohorts"."fee_hkd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "landing_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_en" text NOT NULL,
	"organization_zh_hk" text NOT NULL,
	"market" text NOT NULL,
	"region" text NOT NULL,
	"mou_status" "landing_partner_mou_status" DEFAULT 'prospect' NOT NULL,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "showcase_listings" ADD COLUMN "gone_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cohort_applications" ADD CONSTRAINT "cohort_applications_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_applications" ADD CONSTRAINT "cohort_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_applications_cohort_company_unique" ON "cohort_applications" USING btree ("cohort_id","company_id");--> statement-breakpoint
CREATE INDEX "cohort_applications_cohort_stage_idx" ON "cohort_applications" USING btree ("cohort_id","stage");--> statement-breakpoint
CREATE INDEX "cohort_applications_company_idx" ON "cohort_applications" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cohorts_slug_unique" ON "cohorts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cohorts_public_status_starts_on_idx" ON "cohorts" USING btree ("status","starts_on");--> statement-breakpoint
CREATE INDEX "landing_partners_public_market_status_idx" ON "landing_partners" USING btree ("market","mou_status");