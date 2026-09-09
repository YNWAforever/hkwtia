-- Programme B-7 / S-2: one-time slug derivation; owners can edit afterwards.
WITH candidates AS (
  SELECT id,
         trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))) AS base,
         row_number() OVER (PARTITION BY trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))) ORDER BY created_at, id) AS n
  FROM "companies" WHERE "slug" IS NULL
)
UPDATE "companies" c
SET "slug" = CASE WHEN candidates.n = 1 THEN candidates.base ELSE candidates.base || '-' || candidates.n END
FROM candidates
WHERE c.id = candidates.id AND length(candidates.base) BETWEEN 2 AND 96;
