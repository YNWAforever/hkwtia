CREATE TYPE "public"."company_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."membership_application_status" AS ENUM('draft', 'pending_payment', 'pending_review', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."membership_application_step" AS ENUM('profile', 'company', 'checkout', 'complete', 'review');--> statement-breakpoint
CREATE TYPE "public"."membership_plan_code" AS ENUM('community', 'startup', 'corporate', 'patron');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending_payment', 'pending_review', 'active', 'past_due', 'cancel_at_period_end', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"website" text,
	"industry" text,
	"size_band" text,
	"description" text,
	"logo_reference" text,
	"directory_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "company_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_key" text NOT NULL,
	"kind" text NOT NULL,
	"state" "job_state" DEFAULT 'processing' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_run_key_unique" UNIQUE("run_key")
);
--> statement-breakpoint
CREATE TABLE "membership_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_user_id" text NOT NULL,
	"plan_code" "membership_plan_code" NOT NULL,
	"company_id" uuid,
	"current_step" "membership_application_step" DEFAULT 'profile' NOT NULL,
	"status" "membership_application_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"code" "membership_plan_code" PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"billing_behavior" text NOT NULL,
	"stripe_price_reference" text,
	"seat_allowance" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"company_id" uuid,
	"plan_code" "membership_plan_code" NOT NULL,
	"status" "membership_status" DEFAULT 'pending_payment' NOT NULL,
	"seat_limit" integer NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_period_start" timestamp with time zone,
	"billing_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_target_check" CHECK (("memberships"."owner_user_id" IS NOT NULL AND "memberships"."company_id" IS NULL) OR ("memberships"."owner_user_id" IS NULL AND "memberships"."company_id" IS NOT NULL)),
	CONSTRAINT "memberships_seat_limit_check" CHECK ("memberships"."seat_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"job_title" text,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"onboarding_state" text DEFAULT 'profile' NOT NULL,
	"directory_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"role" "company_member_role" DEFAULT 'member' NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_invitations_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_applicant_user_id_profiles_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_plan_code_membership_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."membership_plans"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_code_membership_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."membership_plans"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_invitations" ADD CONSTRAINT "seat_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_invitations" ADD CONSTRAINT "seat_invitations_inviter_user_id_profiles_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_invitations" ADD CONSTRAINT "seat_invitations_accepted_by_user_id_profiles_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_members_active_company_user_unique" ON "company_members" USING btree ("company_id","user_id") WHERE "company_members"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "company_members_user_idx" ON "company_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jobs_state_idx" ON "jobs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "membership_applications_applicant_idx" ON "membership_applications" USING btree ("applicant_user_id");--> statement-breakpoint
CREATE INDEX "membership_applications_company_idx" ON "membership_applications" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_stripe_subscription_unique" ON "memberships" USING btree ("stripe_subscription_id") WHERE "memberships"."stripe_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "memberships_owner_idx" ON "memberships" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "memberships_company_idx" ON "memberships" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "seat_invitations_company_idx" ON "seat_invitations" USING btree ("company_id");