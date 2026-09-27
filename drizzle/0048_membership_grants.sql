ALTER TABLE "memberships" ADD COLUMN "grant_effective_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "grant_expires_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "grant_reason" text;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "grant_actor_profile_id" text;
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_grant_window_check" CHECK (("grant_effective_at" IS NULL AND "grant_expires_at" IS NULL AND "grant_reason" IS NULL AND "grant_actor_profile_id" IS NULL) OR ("grant_effective_at" IS NOT NULL AND "grant_expires_at" IS NOT NULL AND "grant_reason" IS NOT NULL AND length(trim("grant_reason")) >= 10 AND "grant_actor_profile_id" IS NOT NULL AND "grant_effective_at" < "grant_expires_at"));
--> statement-breakpoint
CREATE INDEX "memberships_grant_expires_at_idx" ON "memberships" ("grant_expires_at");
