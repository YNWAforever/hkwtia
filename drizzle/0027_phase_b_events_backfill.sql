-- Programme B-1 / D-12: derive the new enums from the booleans once. From
-- here on the repository writes both; readers move to the enums over Phase B.
UPDATE "events"
SET "status" = CASE WHEN "published" THEN 'published'::"event_status" ELSE 'draft'::"event_status" END,
    "visibility" = CASE WHEN "member_only" THEN 'members_only'::"event_visibility" ELSE 'public'::"event_visibility" END,
    "published_at" = CASE WHEN "published" THEN COALESCE("published_at", "created_at") ELSE NULL END;
