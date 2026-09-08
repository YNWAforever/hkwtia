-- Programme B-1 / D-12: derive the new enums from the booleans once. Task 2
-- of the Phase B1 plan (`derivedEventFlags` in lib/events/status.ts) makes
-- every repository write derive `published`/`member_only` from these enums;
-- readers move over during Phase B.
UPDATE "events"
SET "status" = CASE WHEN "published" THEN 'published'::"event_status" ELSE 'draft'::"event_status" END,
    "visibility" = CASE WHEN "member_only" THEN 'members_only'::"event_visibility" ELSE 'public'::"event_visibility" END,
    "published_at" = CASE WHEN "published" THEN COALESCE("published_at", "created_at") ELSE NULL END;
