CREATE TYPE "public"."agent_name" AS ENUM('concierge', 'retention_analyst', 'board_reporter');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('news', 'buildlog', 'page');--> statement-breakpoint
ALTER TYPE "public"."agent_trigger" ADD VALUE 'scheduled';--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "post_kind" NOT NULL,
	"title_en" text NOT NULL,
	"title_zh" text NOT NULL,
	"body_mdx" text NOT NULL,
	"published_at" timestamp with time zone,
	"author" text NOT NULL,
	"source_key" text,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_unique" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_source_key_unique" ON "posts" USING btree ("source_key") WHERE "posts"."source_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "request_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_request_key_unique" ON "approvals" USING btree ("request_key") WHERE "approvals"."request_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "agent" "agent_name" DEFAULT 'concierge';--> statement-breakpoint
UPDATE "agent_runs" SET "agent" = 'concierge' WHERE "agent" IS NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "agent" SET NOT NULL;
