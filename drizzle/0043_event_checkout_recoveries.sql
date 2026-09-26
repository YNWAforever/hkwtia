CREATE TABLE "event_checkout_recoveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "recovery_digest" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "invalidated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_checkout_recoveries_order_unique" UNIQUE("order_id"),
  CONSTRAINT "event_checkout_recoveries_digest_unique" UNIQUE("recovery_digest"),
  CONSTRAINT "event_checkout_recoveries_digest_check" CHECK ("recovery_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "event_checkout_recoveries" ADD CONSTRAINT "event_checkout_recoveries_order_id_event_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "event_checkout_recoveries_expiry_idx" ON "event_checkout_recoveries" USING btree ("expires_at");
