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
-- The guard runs on the ordinal rows only (`n > 1`); they are the only rows
-- that can land on another row's base. Applying it to every row also stripped
-- the n = 1 row of every duplicated name, because a sibling in the same
-- partition carries `base` equal to that row's candidate: two plain "Acme"
-- companies left `acme` free and unassigned while minting an `acme-2` with no
-- `-1`, and an ordinary duplicate name silently cost that company its page
-- address. Exempting n = 1 stays collision-free: those rows carry candidate =
-- base and a base has exactly one n = 1 row, and two ordinals can never be
-- equal because the integer suffix holds no `-`, so the last `-` of a
-- candidate always separates base from n.
--
-- A row whose candidate collides keeps a NULL slug, which the partial unique
-- index tolerates and the owner form lets them fix — the same outcome a name
-- that slugifies to fewer than two characters already gets. The length bound
-- is on `candidate` rather than `base` for the same reason: a 96-character
-- base plus `-2` is 98, which both the profile slug schema and
-- `lib/events/filters.ts` (organiser <= 96) reject, so the owner's first save
-- of an untouched form would fail validation.
--
-- Length alone does not pin that rule, though, so the candidate is matched
-- against the portal's own regex as well. `display_name` is CJK-only for an
-- ordinary share of a zh-HK directory and slugifies to '': n = 1 is skipped by
-- the length bound, but n = 2 derives '-2' — two characters, and no base can
-- ever start with '-', so neither the length bound nor the collision guard
-- stops it. It is not a 23505 either, so the deploy stays green while the
-- owner's first save is rejected, `lib/events/filters.ts` can never match the
-- organiser, and `companies_public_profile_slug_check` (NOT NULL only) still
-- lets the profile publish at an unroutable `/members/-2`.
--
-- `tests/fixtures/company-slug.ts` is the TypeScript twin of this statement and
-- `tests/unit/schema-contract.test.ts` asserts these rules as behaviour, since
-- the backfill itself runs once against a database no local gate has. Keep the
-- two in step.
WITH bases AS (
  SELECT id,
         created_at,
         trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))) AS base
  FROM "companies" WHERE "slug" IS NULL
), ordered AS (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY created_at, id) AS n
  FROM bases
), candidates AS (
  SELECT id, base, n, CASE WHEN n = 1 THEN base ELSE base || '-' || n END AS candidate
  FROM ordered
)
UPDATE "companies" c
SET "slug" = candidates.candidate
FROM candidates
WHERE c.id = candidates.id
  AND length(candidates.candidate) BETWEEN 2 AND 96
  AND candidates.candidate ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND (
    candidates.n = 1
    OR NOT EXISTS (
      SELECT 1 FROM candidates other
      WHERE other.id <> candidates.id AND other.base = candidates.candidate
    )
  );
