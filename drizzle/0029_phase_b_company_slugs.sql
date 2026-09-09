-- Programme B-7 / S-2: one-time slug derivation; owners can edit afterwards.
--
-- The ordinal is only unique inside its own base's partition, so the value has
-- to be materialised as `candidate` and checked against every other row's base
-- before it is written: two companies called "Acme" derive `acme` and
-- `acme-2`, and a third called "Acme 2" derives `acme-2` as well. 0028 has
-- already created `companies_slug_unique`, so that pair would raise 23505 and
-- abort the deploy with 0028 applied and 0029 not — a half-migrated database.
-- A `NOT EXISTS ... FROM companies` guard cannot catch it, because this
-- statement's snapshot does not see the rows it is itself writing.
--
-- A row whose candidate collides keeps a NULL slug, which the partial unique
-- index tolerates and the owner form lets them fix — the same outcome a name
-- that slugifies to fewer than two characters already gets. The length bound
-- is on `candidate` rather than `base` for the same reason: a 96-character
-- base plus `-2` is 98, which both the profile slug schema and
-- `lib/events/filters.ts` (organiser <= 96) reject, so the owner's first save
-- of an untouched form would fail validation.
WITH bases AS (
  SELECT id,
         created_at,
         trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))) AS base
  FROM "companies" WHERE "slug" IS NULL
), ordered AS (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY created_at, id) AS n
  FROM bases
), candidates AS (
  SELECT id, base, CASE WHEN n = 1 THEN base ELSE base || '-' || n END AS candidate
  FROM ordered
)
UPDATE "companies" c
SET "slug" = candidates.candidate
FROM candidates
WHERE c.id = candidates.id
  AND length(candidates.candidate) BETWEEN 2 AND 96
  AND NOT EXISTS (
    SELECT 1 FROM candidates other
    WHERE other.id <> candidates.id AND other.base = candidates.candidate
  );
