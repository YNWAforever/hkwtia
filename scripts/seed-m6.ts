import {fileURLToPath} from "node:url";

import {Pool} from "pg";

export const M6_ACCEPTANCE_SEED_ENV = "M6_ACCEPTANCE_SEED";
export const M6_ACCEPTANCE_OWNERSHIP_KEY = "m6-launch-pad-acceptance-v1";

const COHORT_ID = "60000060-0000-4000-8000-000000000001";
const PARTNER_IDS = [
  "60000063-0000-4000-8000-000000000001",
  "60000063-0000-4000-8000-000000000002",
  "60000063-0000-4000-8000-000000000003",
] as const;
const COMPANY_IDS = [
  "60000061-0000-4000-8000-000000000001",
  "60000061-0000-4000-8000-000000000002",
  "60000061-0000-4000-8000-000000000003",
  "60000061-0000-4000-8000-000000000004",
  "60000061-0000-4000-8000-000000000005",
] as const;
const APPLICATION_IDS = [
  "60000062-0000-4000-8000-000000000001",
  "60000062-0000-4000-8000-000000000002",
  "60000062-0000-4000-8000-000000000003",
  "60000062-0000-4000-8000-000000000004",
  "60000062-0000-4000-8000-000000000005",
] as const;

type SeedStage = "applied" | "accepted" | "ready" | "match" | "land";

export type M6SeedFixture = Readonly<{
  asOf: Date;
  cohorts: readonly Readonly<{
    id: string;
    slug: string;
    nameEn: string;
    nameZhHk: string;
    descriptionEn: string;
    descriptionZhHk: string;
    track: string;
    startsOn: string;
    endsOn: string | null;
    capacity: number;
    feeHkd: number;
    status: "open";
  }>[];
  partners: readonly Readonly<{
    id: string;
    organizationEn: string;
    organizationZhHk: string;
    market: string;
    region: string;
    mouStatus: "signed" | "in_discussion" | "prospect";
  }>[];
  companies: readonly Readonly<{id: string; legalName: string; displayName: string}>[];
  applications: readonly Readonly<{id: string; cohortId: string; companyId: string; stage: SeedStage; readiness: Record<string, string>}>[];
}>;

export function buildM6SeedFixture(asOf: Date): M6SeedFixture {
  if (!Number.isFinite(asOf.getTime())) throw new Error("M6_ACCEPTANCE_AS_OF_INVALID");
  return {
    asOf,
    cohorts: [{
      id: COHORT_ID,
      slug: "launch-pad-2026",
      nameEn: "Launch Pad 2026",
      nameZhHk: "Launch Pad 2026",
      descriptionEn: "A synthetic, non-production cohort for M6 acceptance verification.",
      descriptionZhHk: "M6 驗收用的合成、非生產 cohort。",
      track: "cross-border-growth",
      startsOn: "2030-09-01",
      endsOn: "2030-12-31",
      capacity: 24,
      feeHkd: 0,
      status: "open",
    }],
    partners: [
      {id: PARTNER_IDS[0], organizationEn: "Synthetic Singapore Partner", organizationZhHk: "合成新加坡夥伴", market: "Singapore", region: "Southeast Asia", mouStatus: "signed"},
      {id: PARTNER_IDS[1], organizationEn: "Synthetic Tokyo Partner", organizationZhHk: "合成東京夥伴", market: "Japan", region: "Northeast Asia", mouStatus: "in_discussion"},
      {id: PARTNER_IDS[2], organizationEn: "Synthetic London Partner", organizationZhHk: "合成倫敦夥伴", market: "United Kingdom", region: "Europe", mouStatus: "prospect"},
    ],
    companies: COMPANY_IDS.map((id, index) => ({
      id,
      legalName: `Synthetic Launch Pad Company ${index + 1} Limited`,
      displayName: `Synthetic Launch Pad Company ${index + 1}`,
    })),
    applications: (["applied", "accepted", "ready", "match", "land"] as const).map((stage, index) => ({
      id: APPLICATION_IDS[index]!,
      cohortId: COHORT_ID,
      companyId: COMPANY_IDS[index]!,
      stage,
      readiness: {market: ["Singapore", "Japan", "Thailand", "Indonesia", "United Kingdom"][index]!},
    })),
  };
}

export function assertM6SeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment[M6_ACCEPTANCE_SEED_ENV]?.trim().toLowerCase() !== "true") {
    throw new Error("M6_ACCEPTANCE_SEED_NOT_AUTHORIZED");
  }
  if (environment.VERCEL_ENV?.trim().toLowerCase() === "production" || environment.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("M6_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("M6_ACCEPTANCE_DATABASE_URL_REQUIRED");
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) throw new Error("M6_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
  if (databaseUrl !== testDatabaseUrl) throw new Error("M6_ACCEPTANCE_DATABASE_URL_MISMATCH");
  return databaseUrl;
}

export type M6SeedConnection = Readonly<{
  query: (text: string, values?: readonly unknown[]) => Promise<{rows?: readonly Record<string, unknown>[]}>;
  release: () => void;
}>;
export type M6SeedPool = Readonly<{connect: () => Promise<M6SeedConnection>}>;

export async function seedM6(pool: M6SeedPool, options: Readonly<{asOf: Date}>): Promise<void> {
  const fixture = buildM6SeedFixture(options.asOf);
  const connection = await pool.connect();
  let committed = false;
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [M6_ACCEPTANCE_OWNERSHIP_KEY]);
    const cohort = fixture.cohorts[0]!;
    await connection.query(
      `INSERT INTO cohorts
       (id, slug, name_en, name_zh_hk, description_en, description_zh_hk,
        track, starts_on, ends_on, capacity, fee_hkd, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12::cohort_status, $13, $13)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug, name_en = EXCLUDED.name_en,
         name_zh_hk = EXCLUDED.name_zh_hk, description_en = EXCLUDED.description_en,
         description_zh_hk = EXCLUDED.description_zh_hk, track = EXCLUDED.track,
         starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on,
         capacity = EXCLUDED.capacity, fee_hkd = EXCLUDED.fee_hkd,
         status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [cohort.id, cohort.slug, cohort.nameEn, cohort.nameZhHk, cohort.descriptionEn, cohort.descriptionZhHk,
        cohort.track, cohort.startsOn, cohort.endsOn, cohort.capacity, cohort.feeHkd, cohort.status, fixture.asOf],
    );
    for (const company of fixture.companies) {
      await connection.query(
        `INSERT INTO companies (id, legal_name, display_name, directory_visible, created_at, updated_at)
         VALUES ($1, $2, $3, false, $4, $4)
         ON CONFLICT (id) DO UPDATE SET
           legal_name = EXCLUDED.legal_name, display_name = EXCLUDED.display_name,
           directory_visible = EXCLUDED.directory_visible, updated_at = EXCLUDED.updated_at`,
        [company.id, company.legalName, company.displayName, fixture.asOf],
      );
    }
    for (const partner of fixture.partners) {
      await connection.query(
        `INSERT INTO landing_partners
         (id, organization_en, organization_zh_hk, market, region, mou_status,
          contact, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::landing_partner_mou_status,
          '{}'::jsonb, NULL, $7, $7)
         ON CONFLICT (id) DO UPDATE SET
           organization_en = EXCLUDED.organization_en,
           organization_zh_hk = EXCLUDED.organization_zh_hk,
           market = EXCLUDED.market, region = EXCLUDED.region,
           mou_status = EXCLUDED.mou_status, updated_at = EXCLUDED.updated_at`,
        [partner.id, partner.organizationEn, partner.organizationZhHk, partner.market, partner.region, partner.mouStatus, fixture.asOf],
      );
    }
    for (const application of fixture.applications) {
      await connection.query(
        `INSERT INTO cohort_applications
         (id, cohort_id, company_id, stage, readiness, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4::cohort_application_stage, $5::jsonb, NULL, $6, $6)
         ON CONFLICT (cohort_id, company_id) DO UPDATE SET
           stage = EXCLUDED.stage, readiness = EXCLUDED.readiness,
           notes = NULL, updated_at = EXCLUDED.updated_at`,
        [application.id, application.cohortId, application.companyId, application.stage, JSON.stringify(application.readiness), fixture.asOf],
      );
    }
    const counts = (await connection.query(
      `SELECT
         count(*)::integer AS cohort_count,
         (SELECT count(*)::integer FROM landing_partners WHERE id = ANY($1::uuid[])) AS partner_count,
         (SELECT count(*)::integer FROM cohort_applications WHERE cohort_id = $2::uuid) AS application_count,
         (SELECT count(DISTINCT (cohort_id, company_id))::integer FROM cohort_applications WHERE cohort_id = $2::uuid) AS unique_application_pairs
       FROM cohorts WHERE id = $2::uuid`,
      [PARTNER_IDS, COHORT_ID],
    )).rows?.[0];
    if (Number(counts?.cohort_count) !== 1 || Number(counts?.partner_count) !== 3
      || Number(counts?.application_count) !== 5 || Number(counts?.unique_application_pairs) !== 5) {
      throw new Error("M6_ACCEPTANCE_OWNED_COUNT_MISMATCH");
    }
    await connection.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) {
      try { await connection.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    }
    throw error;
  } finally {
    connection.release();
  }
}

type SeedPoolWithEnd = M6SeedPool & Readonly<{end: () => Promise<void>}>;

export async function runM6Seed(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  createPool: (databaseUrl: string) => SeedPoolWithEnd = (databaseUrl) => new Pool({connectionString: databaseUrl}) as unknown as SeedPoolWithEnd,
): Promise<void> {
  const databaseUrl = assertM6SeedEnvironment(environment);
  const pool = createPool(databaseUrl);
  try { await seedM6(pool, {asOf: new Date()}); } finally { await pool.end(); }
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()) {
  runM6Seed().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`M6 Launch Pad acceptance database seed failed: ${code}`);
    process.exitCode = 1;
  });
}
