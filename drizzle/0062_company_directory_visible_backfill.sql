-- Owner decision 2026-10-08 (PR #168): list every existing company in the member directory.
--
-- `companies.directory_visible` gates every colleague in the portal member directory
-- (`lib/db/repos/portal-content.ts`), yet it defaulted to false, no form could set it, and every
-- save of company details forced it back to false. So no real company's members could be listed,
-- whatever they chose on their own profile. Members still appear only if they opted in on their
-- profile; companies can now switch this off again under Company details.
--
-- New companies keep the column default (false) and opt in with the switch.
--
-- Each company switched here gets one audit row, so the backfill can be reversed exactly:
--   UPDATE "companies" SET "directory_visible" = false
--   WHERE "id"::text IN (SELECT "target_id" FROM "audit_events"
--                        WHERE "action" = 'company.directory_visible.backfill');
WITH switched AS (
  UPDATE "companies"
  SET "directory_visible" = true, "updated_at" = now()
  WHERE "directory_visible" = false
  RETURNING "id"
)
INSERT INTO "audit_events" ("actor_type", "action", "target_type", "target_id", "metadata")
SELECT 'system', 'company.directory_visible.backfill', 'company', "id"::text,
       jsonb_build_object('from', false, 'to', true, 'migration', '0062_company_directory_visible_backfill')
FROM switched;
