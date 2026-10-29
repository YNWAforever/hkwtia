-- Enum values only. Do not INSERT rows that use these values in this file:
-- drizzle-kit applies pending migrations in one transaction, and Postgres cannot
-- use a new enum value until that transaction commits.
-- MUST NOT be applied until Willy confirms, together with 0068.
ALTER TYPE "public"."membership_plan_code" ADD VALUE IF NOT EXISTS 'individual';
--> statement-breakpoint
ALTER TYPE "public"."membership_plan_code" ADD VALUE IF NOT EXISTS 'platinum';
