CREATE TABLE "portal_seat_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" "company_member_role" NOT NULL,
	"state" text NOT NULL,
	"error_code" text,
	"invitation_id" uuid,
	"delivery_token" text,
	"claim_id" uuid,
	"claim_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "portal_seat_batch_items_state_check" CHECK ("portal_seat_batch_items"."state" IN ('preview', 'blocked', 'pending', 'delivery_pending', 'sending', 'succeeded', 'skipped', 'failed', 'uncertain')),
	CONSTRAINT "portal_seat_batch_items_position_check" CHECK ("portal_seat_batch_items"."position" BETWEEN 1 AND 50),
	CONSTRAINT "portal_seat_batch_items_attempt_check" CHECK ("portal_seat_batch_items"."attempt_count" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "portal_seat_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_profile_id" text NOT NULL,
	"actor_auth_user_id" text NOT NULL,
	"locale" text NOT NULL,
	"state" text DEFAULT 'preview' NOT NULL,
	"request_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_seat_batches_state_check" CHECK ("portal_seat_batches"."state" IN ('preview', 'committed')),
	CONSTRAINT "portal_seat_batches_locale_check" CHECK ("portal_seat_batches"."locale" IN ('en', 'zh-HK'))
);
--> statement-breakpoint
ALTER TABLE "portal_seat_batch_items" ADD CONSTRAINT "portal_seat_batch_items_batch_id_portal_seat_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."portal_seat_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_seat_batch_items" ADD CONSTRAINT "portal_seat_batch_items_invitation_id_seat_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."seat_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_seat_batches" ADD CONSTRAINT "portal_seat_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_seat_batches" ADD CONSTRAINT "portal_seat_batches_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_seat_batch_items_position_unique" ON "portal_seat_batch_items" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "portal_seat_batch_items_state_idx" ON "portal_seat_batch_items" USING btree ("batch_id","state","position");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_seat_batches_request_unique" ON "portal_seat_batches" USING btree ("actor_profile_id","request_id");--> statement-breakpoint
CREATE INDEX "portal_seat_batches_company_idx" ON "portal_seat_batches" USING btree ("company_id","created_at");