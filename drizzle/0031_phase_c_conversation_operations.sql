CREATE TYPE "public"."conversation_handling" AS ENUM('bot', 'human', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_delivery_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
ALTER TYPE "public"."message_role" ADD VALUE 'staff';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel" "message_channel" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handling" "conversation_handling" DEFAULT 'bot' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assigned_to_profile_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "whatsapp_member_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_staff_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "direction" "message_direction" DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery_status" "message_delivery_status";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_by_profile_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "outbound_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "send_claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_profile_id_profiles_id_fk" FOREIGN KEY ("assigned_to_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_profile_id_profiles_id_fk" FOREIGN KEY ("sent_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_handling_assigned_idx" ON "conversations" USING btree ("handling","assigned_to_profile_id");--> statement-breakpoint
CREATE INDEX "conversations_contact_idx" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_outbound_key_unique" ON "messages" USING btree ("outbound_key") WHERE "messages"."outbound_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_delivery_status_idx" ON "messages" USING btree ("delivery_status") WHERE "messages"."delivery_status" IS NOT NULL;