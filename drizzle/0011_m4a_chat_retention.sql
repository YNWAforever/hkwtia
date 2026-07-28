ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_kind" varchar(32) DEFAULT 'concierge' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_agent_kind_expires_idx" ON "conversations" USING btree ("agent_kind","expires_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_kind_check" CHECK ("conversations"."agent_kind" IN ('concierge', 'retention-analyst', 'board-reporter'));