CREATE TYPE "public"."contact_activity_kind" AS ENUM('note', 'stage_change', 'owner_change', 'next_step', 'invite_sent', 'invite_opened', 'applied', 'became_member');--> statement-breakpoint
CREATE TABLE "contact_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"actor_profile_id" text,
	"kind" "contact_activity_kind" NOT NULL,
	"body" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"plan_code" "membership_plan_code" NOT NULL,
	"created_by_profile_id" text,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "join_invites_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "next_step" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "next_step_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_touch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_applications" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_invites" ADD CONSTRAINT "join_invites_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_invites" ADD CONSTRAINT "join_invites_plan_code_membership_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."membership_plans"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_invites" ADD CONSTRAINT "join_invites_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_invites" ADD CONSTRAINT "join_invites_application_id_membership_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."membership_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_activities_contact_created_idx" ON "contact_activities" USING btree ("contact_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "join_invites_contact_idx" ON "join_invites" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_invite_id_join_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."join_invites"("id") ON DELETE set null ON UPDATE no action;