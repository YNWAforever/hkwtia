ALTER TABLE "rate_limit_buckets" DROP CONSTRAINT "rate_limit_buckets_scope_check";
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_scope_check" CHECK ("scope" IN ('guest-rsvp','ticket-checkout','auth-send-ip','auth-send-email','auth-credential-ip'));
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" DROP CONSTRAINT "rate_limit_buckets_count_check";
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" BETWEEN 1 AND 20);
