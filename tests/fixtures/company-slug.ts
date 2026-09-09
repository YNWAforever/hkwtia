import {organiserSlugFromDisplayName} from "@/lib/events/filters";

/** A `companies` row as the `bases` CTE of migration 0029 reads it. */
export type CompanySlugSeedRow = Readonly<{id: string; displayName: string; createdAt: Date}>;

/** One row's derivation: `slug` is null where 0029 leaves the column untouched. */
export type CompanySlugCandidate = Readonly<{
  id: string;
  base: string;
  ordinal: number;
  candidate: string;
  slug: string | null;
}>;

/** `length(candidates.candidate) BETWEEN 2 AND 96` in the migration. */
const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 96;

/**
 * The TypeScript twin of `drizzle/0029_phase_b_company_slugs.sql`, the way
 * tests/fixtures/event-row.ts mirrors 0027's derivation (programme D-12).
 * The backfill runs once, against a database no local gate has, so its
 * de-duplication rules are only ever asserted as behaviour through this
 * mirror; a review reading the SQL alone missed that the collision guard was
 * stripping slugs from rows that did not collide. Keep the two in step CTE for
 * CTE.
 *
 * Task 2 needs the same derivation in production code for the portal's slug
 * field; promote this helper rather than writing a third copy.
 */
export function backfillCompanySlugs(rows: readonly CompanySlugSeedRow[]): readonly CompanySlugCandidate[] {
  // `ordered`: row_number() OVER (PARTITION BY base ORDER BY created_at, id).
  const ordinals = new Map<string, number>();
  const candidates = rows
    .map((row) => ({id: row.id, createdAt: row.createdAt, base: organiserSlugFromDisplayName(row.displayName)}))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((row) => {
      const ordinal = (ordinals.get(row.base) ?? 0) + 1;
      ordinals.set(row.base, ordinal);
      return {id: row.id, base: row.base, ordinal, candidate: ordinal === 1 ? row.base : `${row.base}-${ordinal}`};
    });

  return candidates.map((row) => {
    const withinLength = row.candidate.length >= MIN_SLUG_LENGTH && row.candidate.length <= MAX_SLUG_LENGTH;
    // Only an ordinal can land on another row's base ("Acme" #2 derives
    // `acme-2`, which "Acme 2" owns outright). An n = 1 row carries candidate =
    // base and a base has exactly one n = 1 row, so guarding it too would strip
    // the bare slug from every duplicated name for no gain.
    const takenByAnotherBase = row.ordinal > 1
      && candidates.some((other) => other.id !== row.id && other.base === row.candidate);
    return {...row, slug: withinLength && !takenByAnotherBase ? row.candidate : null};
  });
}
