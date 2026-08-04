import {fileURLToPath} from "node:url";

import {Pool} from "pg";

export const M5_ACCEPTANCE_SEED_ENV = "M5_ACCEPTANCE_SEED";
export const M5_ACCEPTANCE_OWNERSHIP_KEY = "m5-showcase-acceptance-v1";

const COMPANY_IDS = [
  "50000070-0000-4000-8000-000000000001",
  "50000070-0000-4000-8000-000000000002",
  "50000070-0000-4000-8000-000000000003",
] as const;
const LISTING_IDS = [
  "50000071-0000-4000-8000-000000000001",
  "50000071-0000-4000-8000-000000000002",
  "50000071-0000-4000-8000-000000000003",
] as const;

type SeedStatus = "draft" | "pending_review" | "published" | "rejected";
export type M5SeedListing = Readonly<{
  id: string;
  companyId: string;
  slug: string;
  status: SeedStatus;
  premium: boolean;
  views: number;
  memberSince: string;
  nameEn: string;
  nameZhHk: string;
  taglineEn: string;
  taglineZhHk: string;
  descriptionEn: string;
  descriptionZhHk: string;
  category: string;
  useCases: readonly string[];
  deploymentOptions: readonly string[];
  supportedLanguages: readonly string[];
  worksWith: readonly string[];
  videoUrl: string | null;
  caseStudyUrl: string | null;
  caseStudySummaryEn: string | null;
  caseStudySummaryZhHk: string | null;
  logoReference: string | null;
}>;

export type M5SeedFixture = Readonly<{asOf: Date; listings: readonly M5SeedListing[]}>;

export function buildM5SeedFixture(asOf: Date): M5SeedFixture {
  if (!Number.isFinite(asOf.getTime())) throw new Error("M5_ACCEPTANCE_AS_OF_INVALID");
  return {
    asOf,
    listings: [
      {
        id: LISTING_IDS[0], companyId: COMPANY_IDS[0], slug: "harbour-vision-ai",
        status: "published", premium: true, views: 42, memberSince: "2020-01-01",
        nameEn: "Harbour Vision AI", nameZhHk: "港灣視野 AI", taglineEn: "Trade intelligence for Hong Kong teams", taglineZhHk: "為香港團隊而設的貿易智能",
        descriptionEn: "A synthetic acceptance listing for cross-border trade intelligence.", descriptionZhHk: "用於驗收的跨境貿易智能示例公司。",
        category: "software", useCases: ["logistics", "trade"], deploymentOptions: ["cloud"], supportedLanguages: ["en", "zh-HK"], worksWith: ["ERP", "CRM"],
        videoUrl: "https://example.com/m5/harbour-vision-ai", caseStudyUrl: "https://example.com/m5/harbour-case-study", caseStudySummaryEn: "Synthetic case study", caseStudySummaryZhHk: "示例案例研究", logoReference: "/images/showcase/harbour-vision-ai.svg",
      },
      {
        id: LISTING_IDS[1], companyId: COMPANY_IDS[1], slug: "jade-logistics-platform",
        status: "published", premium: false, views: 9, memberSince: "2021-06-15",
        nameEn: "Jade Logistics Platform", nameZhHk: "翠玉物流平台", taglineEn: "Shipment visibility across Asia", taglineZhHk: "連接亞洲的貨運可視化",
        descriptionEn: "A synthetic acceptance listing for shipment visibility.", descriptionZhHk: "用於驗收的貨運可視化示例公司。",
        category: "software", useCases: ["logistics"], deploymentOptions: ["cloud", "hybrid"], supportedLanguages: ["en", "zh-HK"], worksWith: ["ERP"],
        videoUrl: null, caseStudyUrl: null, caseStudySummaryEn: null, caseStudySummaryZhHk: null, logoReference: "/images/showcase/jade-logistics.svg",
      },
      {
        id: LISTING_IDS[2], companyId: COMPANY_IDS[2], slug: "lion-rock-cyber",
        status: "pending_review", premium: false, views: 0, memberSince: "2023-03-20",
        nameEn: "Lion Rock Cyber", nameZhHk: "獅子山網安", taglineEn: "Practical cyber resilience", taglineZhHk: "實用網絡韌性",
        descriptionEn: "A synthetic listing awaiting staff review.", descriptionZhHk: "等待職員審核的示例公司。",
        category: "security", useCases: ["risk"], deploymentOptions: ["on-prem"], supportedLanguages: ["en"], worksWith: ["SIEM"],
        videoUrl: null, caseStudyUrl: null, caseStudySummaryEn: null, caseStudySummaryZhHk: null, logoReference: "/images/showcase/lion-rock-cyber.svg",
      },
    ],
  };
}

export function assertM5SeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment[M5_ACCEPTANCE_SEED_ENV]?.trim().toLowerCase() !== "true") {
    throw new Error("M5_ACCEPTANCE_SEED_NOT_AUTHORIZED");
  }
  if (environment.VERCEL_ENV?.trim().toLowerCase() === "production" || environment.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("M5_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("M5_ACCEPTANCE_DATABASE_URL_REQUIRED");
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) throw new Error("M5_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
  if (databaseUrl !== testDatabaseUrl) throw new Error("M5_ACCEPTANCE_DATABASE_URL_MISMATCH");
  return databaseUrl;
}

export type M5SeedConnection = Readonly<{
  query: (text: string, values?: readonly unknown[]) => Promise<{rows?: readonly Record<string, unknown>[]}>;
  release: () => void;
}>;
export type M5SeedPool = Readonly<{connect: () => Promise<M5SeedConnection>}>;

function fixtureCompanyRows(fixture: M5SeedFixture) {
  return fixture.listings.map((listing) => ({id: listing.companyId, legalName: `${listing.nameEn} Limited`, displayName: listing.nameEn}));
}

export async function seedM5(pool: M5SeedPool, options: Readonly<{asOf: Date}>): Promise<void> {
  const fixture = buildM5SeedFixture(options.asOf);
  const connection = await pool.connect();
  let committed = false;
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [M5_ACCEPTANCE_OWNERSHIP_KEY]);
    const listingIds = fixture.listings.map(({id}) => id);
    const companyIds = fixture.listings.map(({companyId}) => companyId);
    await connection.query("DELETE FROM leads WHERE listing_id = ANY($1::uuid[])", [listingIds]);
    await connection.query("DELETE FROM showcase_listings WHERE id = ANY($1::uuid[])", [listingIds]);
    await connection.query("DELETE FROM companies WHERE id = ANY($1::uuid[])", [companyIds]);

    for (const company of fixtureCompanyRows(fixture)) {
      await connection.query(
        `INSERT INTO companies (id, legal_name, display_name, directory_visible, created_at, updated_at)
         VALUES ($1, $2, $3, false, $4, $4)`,
        [company.id, company.legalName, company.displayName, fixture.asOf],
      );
    }
    for (const listing of fixture.listings) {
      await connection.query(
        `INSERT INTO showcase_listings
         (id, company_id, slug, status, premium, views, member_since,
          name_en, name_zh_hk, tagline_en, tagline_zh_hk, description_en,
          description_zh_hk, category, use_cases, deployment_options,
          supported_languages, works_with, video_url, case_study_url,
          case_study_summary_en, case_study_summary_zh_hk, logo_reference,
          created_at, updated_at)
         VALUES ($1, $2, $3, $4::showcase_listing_status, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $24)`,
        [listing.id, listing.companyId, listing.slug, listing.status, listing.premium, listing.views, listing.memberSince,
          listing.nameEn, listing.nameZhHk, listing.taglineEn, listing.taglineZhHk, listing.descriptionEn, listing.descriptionZhHk,
          listing.category, listing.useCases, listing.deploymentOptions, listing.supportedLanguages, listing.worksWith,
          listing.videoUrl, listing.caseStudyUrl, listing.caseStudySummaryEn, listing.caseStudySummaryZhHk, listing.logoReference, fixture.asOf],
      );
    }
    const result = await connection.query(
      `SELECT count(*)::integer AS listing_count,
              count(*) FILTER (WHERE status = 'published')::integer AS published_count,
              count(*) FILTER (WHERE status = 'pending_review')::integer AS review_count
       FROM showcase_listings WHERE id = ANY($1::uuid[])`,
      [listingIds],
    );
    const row = result.rows?.[0];
    if (Number(row?.listing_count) !== 3 || Number(row?.published_count) !== 2 || Number(row?.review_count) !== 1) {
      throw new Error("M5_ACCEPTANCE_OWNED_COUNT_MISMATCH");
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

type SeedPoolWithEnd = M5SeedPool & Readonly<{end: () => Promise<void>}>;

export async function runM5Seed(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  createPool: (databaseUrl: string) => SeedPoolWithEnd = (databaseUrl) => new Pool({connectionString: databaseUrl}) as unknown as SeedPoolWithEnd,
): Promise<void> {
  const databaseUrl = assertM5SeedEnvironment(environment);
  const pool = createPool(databaseUrl);
  try { await seedM5(pool, {asOf: new Date()}); } finally { await pool.end(); }
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()) {
  runM5Seed().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`M5 Showcase acceptance database seed failed: ${code}`);
    process.exitCode = 1;
  });
}
