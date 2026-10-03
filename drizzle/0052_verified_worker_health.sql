CREATE TABLE "job_health" (
	"job_key" text PRIMARY KEY NOT NULL,
	"worker_revision" text NOT NULL,
	"web_revision" text,
	"poll_id" uuid NOT NULL,
	"last_started_at" timestamp with time zone NOT NULL,
	"last_finished_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"outcome" text NOT NULL,
	"elapsed_ms" integer,
	"error_code" text,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "job_health_registered_key" CHECK ("job_health"."job_key" IN ('aiops-metrics','journey-runner','approvals-expirer','renewal-runner','engagement-score','chat-retention','retention-analyst','board-reporter','whatsapp-send-queue','event-cancellation-refunds','event-notifications','showcase-lead-emails','ticket-emails','admin-batches','membership-grant-expiry','rate-limit-cleanup','member-import-retention')),
	CONSTRAINT "job_health_revision" CHECK ("job_health"."worker_revision" ~ '^[a-f0-9]{40}$' AND ("job_health"."web_revision" IS NULL OR "job_health"."web_revision" ~ '^[a-f0-9]{40}$')),
	CONSTRAINT "job_health_outcome" CHECK ("job_health"."outcome" IN ('processing','completed','disabled','failed','uncertain')),
	CONSTRAINT "job_health_elapsed" CHECK ("job_health"."elapsed_ms" IS NULL OR "job_health"."elapsed_ms">=0),
	CONSTRAINT "job_health_counts" CHECK (jsonb_typeof("job_health"."counts")='object' AND octet_length("job_health"."counts"::text)<=2048)
);
