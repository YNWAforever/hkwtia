ALTER TABLE "media" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "storage_etag" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "byte_size" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "focal_x" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "focal_y" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "checksum_sha256" text;--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_unique" ON "media" USING btree ("storage_key");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_metadata_all_or_none_check" CHECK (num_nonnulls("media"."storage_key", "media"."storage_etag", "media"."original_filename", "media"."content_type", "media"."byte_size", "media"."width", "media"."height", "media"."focal_x", "media"."focal_y", "media"."checksum_sha256") IN (0, 10));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_byte_size_check" CHECK ("media"."byte_size" IS NULL OR "media"."byte_size" BETWEEN 1 AND 4194304);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_dimensions_check" CHECK ("media"."width" IS NULL OR ("media"."width" BETWEEN 1 AND 10000 AND "media"."height" BETWEEN 1 AND 10000 AND "media"."width"::bigint * "media"."height"::bigint <= 40000000));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_focal_check" CHECK ("media"."focal_x" IS NULL OR ("media"."focal_x" BETWEEN 0 AND 100 AND "media"."focal_y" BETWEEN 0 AND 100));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_checksum_check" CHECK ("media"."checksum_sha256" IS NULL OR "media"."checksum_sha256" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_etag_check" CHECK ("media"."storage_etag" IS NULL OR char_length(btrim("media"."storage_etag", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_upload_content_type_check" CHECK ("media"."content_type" IS NULL OR "media"."content_type" IN ('image/png', 'image/jpeg', 'image/webp'));

-- Forward verification (run only after an explicitly approved isolated migration):
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'media' ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.media'::regclass AND conname LIKE 'media_upload_%'
-- ORDER BY conname;
--
-- This query must return zero rows. It covers uploaded media with incomplete
-- metadata, a missing ETag, invalid checksum or bounds, and a noncanonical URL:
-- SELECT id FROM media
-- WHERE num_nonnulls(storage_key, storage_etag, original_filename, content_type,
--   byte_size, width, height, focal_x, focal_y, checksum_sha256) NOT IN (0, 10)
-- OR (storage_key IS NOT NULL AND (
--   char_length(btrim(storage_etag, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0
--   OR checksum_sha256 !~ '^[0-9a-f]{64}$'
--   OR content_type NOT IN ('image/png', 'image/jpeg', 'image/webp')
--   OR byte_size NOT BETWEEN 1 AND 4194304
--   OR width NOT BETWEEN 1 AND 10000 OR height NOT BETWEEN 1 AND 10000
--   OR width::bigint * height::bigint > 40000000
--   OR focal_x NOT BETWEEN 0 AND 100 OR focal_y NOT BETWEEN 0 AND 100
--   OR url <> '/api/media/' || id::text));
--
-- Database SQL cannot prove private object bytes. An authorized isolated
-- application verification must report zero rows whose ETag-bound GetObject
-- ETag, length, content type, sha256 metadata, or streamed body digest differs.
-- The archived-reference UNION ALL across partners and showcase_listings in
-- 0020_wisetech_partners.sql remains required before archive/public cutover.
--
-- Application rollback deploys the preceding application commit while retaining
-- this additive schema, all rows, and private objects. Destructive schema
-- downgrade and object deletion are not rollback. This migration was not run.
