CREATE TYPE "public"."partner_category" AS ENUM('supporting', 'media', 'regional', 'programme', 'sponsor');--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_zh_hk" text NOT NULL,
	"category" "partner_category" NOT NULL,
	"website_url" text,
	"logo_media_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"relationship_starts_on" date,
	"relationship_ends_on" date,
	"relationship_confirmed_at" timestamp with time zone,
	"logo_rights_confirmed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_name_en_check" CHECK (char_length(btrim("partners"."name_en", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 160),
	CONSTRAINT "partners_name_zh_hk_check" CHECK (char_length(btrim("partners"."name_zh_hk", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 160),
	CONSTRAINT "partners_display_order_check" CHECK ("partners"."display_order" >= 0 AND "partners"."display_order" <= 10000),
	CONSTRAINT "partners_relationship_window_check" CHECK ("partners"."relationship_ends_on" IS NULL OR "partners"."relationship_starts_on" IS NULL OR "partners"."relationship_ends_on" >= "partners"."relationship_starts_on")
);
--> statement-breakpoint
ALTER TABLE "landing_partners" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "landing_partners" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partners_public_state_idx" ON "partners" USING btree ("archived_at","published_at","featured","display_order","id");--> statement-breakpoint
CREATE INDEX "partners_logo_media_idx" ON "partners" USING btree ("logo_media_id");--> statement-breakpoint
CREATE INDEX "landing_partners_publication_idx" ON "landing_partners" USING btree ("published_at","archived_at","market","id");
-- Forward verification (run only after an explicitly approved isolated migration):
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name IN ('partners', 'landing_partners')
-- ORDER BY table_name, ordinal_position;
--
-- These queries must return zero rows before PR5 public cutover. Bilingual
-- nonblank checks use the JavaScript String.prototype.trim() whitespace set:
-- SELECT p.id FROM partners p LEFT JOIN media m ON m.id = p.logo_media_id
-- WHERE p.published_at IS NOT NULL AND (p.published_at > CURRENT_TIMESTAMP
--   OR p.archived_at IS NOT NULL OR p.relationship_confirmed_at IS NULL
--   OR p.logo_rights_confirmed_at IS NULL OR m.id IS NULL OR m.archived_at IS NOT NULL
--   OR char_length(btrim(m.alt_en, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0
--   OR char_length(btrim(m.alt_zh, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0);
-- SELECT p.id FROM partners p WHERE p.published_at IS NOT NULL
--   AND (p.relationship_starts_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Hong_Kong')::date
--     OR p.relationship_ends_on < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Hong_Kong')::date);
-- SELECT 'partner' AS authority, p.id, p.logo_media_id FROM partners p
--   JOIN media m ON m.id = p.logo_media_id WHERE m.archived_at IS NOT NULL
-- UNION ALL
-- SELECT 'showcase_listing' AS authority, s.id, s.logo_media_id FROM showcase_listings s
--   JOIN media m ON m.id = s.logo_media_id WHERE m.archived_at IS NOT NULL;
-- SELECT id FROM landing_partners WHERE published_at IS NOT NULL
--   AND (archived_at IS NOT NULL OR mou_status <> 'signed');
--
-- Application rollback deploys the preceding application commit while retaining
-- this additive schema and all rows. Destructive schema downgrade is not rollback.
