CREATE TYPE "public"."billing_attempt_state" AS ENUM('active', 'completed', 'abandoned', 'expired');--> statement-breakpoint
CREATE TABLE "billing_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"price_reference" text NOT NULL,
	"state" "billing_attempt_state" DEFAULT 'active' NOT NULL,
	"stripe_checkout_session_id" text,
	"checkout_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "billing_attempts_membership_number_unique" UNIQUE("membership_id","attempt_number"),
	CONSTRAINT "billing_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "billing_attempts_number_check" CHECK ("billing_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "billing_attempts" ADD CONSTRAINT "billing_attempts_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_attempts_active_membership_unique" ON "billing_attempts" USING btree ("membership_id") WHERE "billing_attempts"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_attempts_stripe_session_unique" ON "billing_attempts" USING btree ("stripe_checkout_session_id") WHERE "billing_attempts"."stripe_checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "billing_attempts_membership_idx" ON "billing_attempts" USING btree ("membership_id");