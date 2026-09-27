CREATE TABLE "rate_limit_buckets" (
  "scope" text NOT NULL,
  "key_hash" text NOT NULL,
  "window_started_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "count" integer NOT NULL,
  CONSTRAINT "rate_limit_buckets_scope_key_hash_pk" PRIMARY KEY ("scope", "key_hash"),
  CONSTRAINT "rate_limit_buckets_scope_check" CHECK ("scope" IN ('guest-rsvp','ticket-checkout')),
  CONSTRAINT "rate_limit_buckets_hash_check" CHECK ("key_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "rate_limit_buckets_window_check" CHECK ("expires_at" > "window_started_at"),
  CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expiry_idx" ON "rate_limit_buckets" ("expires_at");
