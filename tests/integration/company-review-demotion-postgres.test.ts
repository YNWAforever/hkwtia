import {randomUUID} from "node:crypto";

import {Pool} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-serverless";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {companiesRepository, type CompanyUpdate} from "@/lib/db/repos/companies";

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const profileId = `b2-demotion-${process.pid}-${Date.now()}`;
const actor = {kind: "member", userId: profileId, profileId} as const;
const reviewedAt = new Date("2026-09-01T10:00:00.000Z");
const companyIds: string[] = [];
let pool: Pool | undefined;

/** The payload `/portal/company` posts: every publicly rendered key, every save. */
function portalCompanySave(overrides: CompanyUpdate = {}): CompanyUpdate {
  return {
    legalName: "Acme Limited",
    displayName: "Acme",
    website: "https://acme.example",
    industry: "logistics-technology",
    sizeBand: "11-50",
    description: "Approved copy.",
    directoryVisible: true,
    ...overrides,
  };
}

/**
 * A company that has been through staff review, owned by `actor`. Each test
 * seeds its own so the order they run in cannot change what they observe.
 */
async function seedPublishedCompany(): Promise<string> {
  if (!pool) throw new Error("DATABASE_URL_TEST pool was not initialized");
  const companyId = randomUUID();
  companyIds.push(companyId);
  await pool.query(
    `INSERT INTO companies (
       id, legal_name, display_name, website, industry, size_band, description, directory_visible,
       slug, public_profile_status, public_profile_published_at,
       profile_reviewed_at, profile_reviewed_by_profile_id, profile_rejection_reason
     ) VALUES ($1, 'Acme Limited', 'Acme', 'https://acme.example', 'logistics-technology', '11-50',
              'Approved copy.', true, $2, 'published', $3, $3, $4, 'an earlier rejection')`,
    [companyId, `acme-${companyId}`, reviewedAt, profileId],
  );
  await pool.query(
    "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
    [companyId, profileId],
  );
  return companyId;
}

/**
 * Programme B-7, and the only check in the suite that runs a repository
 * statement against Postgres rather than asserting on its text.
 *
 * It pins two things at once. The demotion gate `reviewResetFor` builds is an
 * `IS DISTINCT FROM` comparison evaluated by Postgres, so a JS re-implementation
 * of it in a unit test proves nothing about NULL handling or about the fact that
 * an UPDATE's SET expressions all read the pre-update row; only a real statement
 * does. And a repository's whole member-actor surface is unreachable if its
 * authorization predicate does not parse — `EXISTS` needs its subquery
 * parenthesised, which no text assertion on generated SQL will tell you.
 */
describe.skipIf(!testDatabaseUrl)("company review demotion on isolated Postgres", () => {
  beforeAll(async () => {
    pool = new Pool({connectionString: testDatabaseUrl});
    database.current = drizzle(pool);
    await pool.query(
      `INSERT INTO profiles (id, auth_user_id, display_name)
       VALUES ($1, $2, 'B2 demotion test')
       ON CONFLICT (id) DO NOTHING`,
      [profileId, `auth-${profileId}`],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    if (companyIds.length > 0) await pool.query("DELETE FROM companies WHERE id = ANY($1::uuid[])", [companyIds]);
    await pool.query("DELETE FROM profiles WHERE id = $1", [profileId]);
    await pool.end();
  });

  it("keeps a re-saved published company published, with its reviewer columns", async () => {
    const companyId = await seedPublishedCompany();

    await expect(companiesRepository.update(actor, companyId, portalCompanySave())).resolves.toMatchObject({
      id: companyId,
      publicProfileStatus: "published",
      profileReviewedAt: reviewedAt,
      profileReviewedByProfileId: profileId,
      profileRejectionReason: "an earlier rejection",
    });
  });

  it("keeps a published company published when only the legal name changes", async () => {
    const companyId = await seedPublishedCompany();

    await expect(companiesRepository.update(actor, companyId, portalCompanySave({legalName: "Acme Group Limited"})))
      .resolves.toMatchObject({
        id: companyId,
        legalName: "Acme Group Limited",
        publicProfileStatus: "published",
        profileReviewedAt: reviewedAt,
        profileReviewedByProfileId: profileId,
      });
  });

  it("sends a rewritten description back to review and clears the reviewer columns", async () => {
    const companyId = await seedPublishedCompany();

    await expect(companiesRepository.update(actor, companyId, portalCompanySave({description: "Rewritten after approval"})))
      .resolves.toMatchObject({
        id: companyId,
        description: "Rewritten after approval",
        publicProfileStatus: "pending_review",
        profileReviewedAt: null,
        profileReviewedByProfileId: null,
        profileRejectionReason: null,
      });
  });
});
