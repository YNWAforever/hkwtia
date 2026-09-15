CREATE TYPE "public"."event_order_status" AS ENUM('pending', 'paid', 'expired', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."event_refund_reason" AS ENUM('oversold', 'staff', 'cancelled');--> statement-breakpoint
CREATE TABLE "event_order_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"attendee_name" text NOT NULL,
	"attendee_email" text NOT NULL,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"buyer_profile_id" text,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_locale" text NOT NULL,
	"amount_hkd_cents" integer NOT NULL,
	"currency" text DEFAULT 'hkd' NOT NULL,
	"status" "event_order_status" DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_checkout_url" text,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_reason" "event_refund_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_orders_amount_check" CHECK ("event_orders"."amount_hkd_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_price_hkd_cents" integer;--> statement-breakpoint
ALTER TABLE "event_order_seats" ADD CONSTRAINT "event_order_seats_order_id_event_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_orders" ADD CONSTRAINT "event_orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_orders" ADD CONSTRAINT "event_orders_buyer_profile_id_profiles_id_fk" FOREIGN KEY ("buyer_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_order_seats_position_unique" ON "event_order_seats" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "event_orders_session_unique" ON "event_orders" USING btree ("stripe_checkout_session_id") WHERE "event_orders"."stripe_checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_orders_idempotency_unique" ON "event_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "event_orders_event_status_idx" ON "event_orders" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ticketed_price_check" CHECK ("events"."registration_mode" <> 'ticketed' OR ("events"."ticket_price_hkd_cents" IS NOT NULL AND "events"."ticket_price_hkd_cents" > 0));