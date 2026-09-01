ALTER TABLE "posts" ADD COLUMN "body_mdx_zh_hk" text;

-- Forward verification (run only after an explicitly approved isolated migration):
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'posts'
-- ORDER BY ordinal_position;
--
-- This query reports every news row still missing reviewed Traditional Chinese
-- content. It is expected to report legacy rows until CMS or approved PR7 work
-- supplies content-owner-reviewed translations; this migration performs no backfill:
-- SELECT id, slug FROM posts
-- WHERE kind = 'news'
--   AND (body_mdx_zh_hk IS NULL
--     OR char_length(btrim(body_mdx_zh_hk, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0);
--
-- Application rollback deploys the preceding application commit while retaining
-- this nullable additive column and any reviewed translations. Destructive
-- schema downgrade is not rollback. This migration was not run.
