CREATE TABLE "acceptance_sentinel" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"designated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"designated_by" text NOT NULL,
	"note" text,
	CONSTRAINT "acceptance_sentinel_single_row" CHECK ("acceptance_sentinel"."id")
);
