CREATE TABLE "showcase_lead_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claim_expires_at" timestamp with time zone,
	"first_attempt_at" timestamp with time zone,
	"provider_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "showcase_lead_email_outbox_lead_kind_unique" UNIQUE("lead_id","kind"),
	CONSTRAINT "showcase_lead_email_outbox_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "showcase_lead_email_outbox_kind_check" CHECK ("showcase_lead_email_outbox"."kind" IN ('ack', 'staff')),
	CONSTRAINT "showcase_lead_email_outbox_status_check" CHECK ("showcase_lead_email_outbox"."status" IN ('queued', 'sending', 'sent', 'blocked', 'uncertain')),
	CONSTRAINT "showcase_lead_email_outbox_attempt_check" CHECK ("showcase_lead_email_outbox"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "showcase_lead_email_outbox" ADD CONSTRAINT "showcase_lead_email_outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "showcase_lead_email_outbox_due_idx" ON "showcase_lead_email_outbox" USING btree ("status","next_attempt_at","claim_expires_at");