ALTER TABLE "events" ADD COLUMN "hero_media_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_hero_media_id_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_hero_media_idx" ON "events" USING btree ("hero_media_id");