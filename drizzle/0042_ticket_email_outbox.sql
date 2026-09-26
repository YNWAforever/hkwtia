CREATE TABLE "ticket_email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "seat_id" uuid,
  "kind" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "payload" jsonb,
  "event_key" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claim_expires_at" timestamp with time zone,
  "first_attempt_at" timestamp with time zone,
  "provider_id" text,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_email_outbox_event_key_unique" UNIQUE("event_key"),
  CONSTRAINT "ticket_email_outbox_kind_check" CHECK ("kind" IN ('confirmation', 'pass', 'refund', 'refund_failed')),
  CONSTRAINT "ticket_email_outbox_status_check" CHECK ("status" IN ('queued', 'sending', 'sent', 'blocked', 'uncertain', 'suppressed')),
  CONSTRAINT "ticket_email_outbox_attempt_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "ticket_email_outbox_seat_check" CHECK (("kind" = 'pass') = ("seat_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ticket_email_outbox" ADD CONSTRAINT "ticket_email_outbox_order_id_event_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."event_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_email_outbox" ADD CONSTRAINT "ticket_email_outbox_seat_id_event_order_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."event_order_seats"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ticket_email_outbox_due_idx" ON "ticket_email_outbox" USING btree ("status","next_attempt_at","claim_expires_at");