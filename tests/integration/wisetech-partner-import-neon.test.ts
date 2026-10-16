// @vitest-environment node
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import sharp from "sharp";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import * as importer from "@/scripts/import-wisetech-partners";
import {normalizeImageUpload} from "@/lib/media/image-upload";
import {assertPartnerImportAuthorized} from "@/scripts/lib/partner-import-guard";
import {finalAuditIsolatedDatabaseUrl} from "@/tests/fixtures/audit-isolated-db";

const url = finalAuditIsolatedDatabaseUrl();
const run = `partner-import-${randomUUID()}`;
const actorId = `${run}-staff`;
let pool: Pool;
let png: Buffer;
const donor = Array.from({length: 79}, (_, index) => ({
  name: `${run}-${index}`,
  category: index < 58 ? "supporting" as const : index < 73 ? "regional" as const : "media" as const,
  logoFile: `synthetic-${index}.png`,
}));
const authorization = {actorProfileId: actorId, actorKind: "staff" as const};

// This assertion also makes a missing production adapter fail explicitly, rather than
// allowing a skipped integration suite to hide an unavailable SQL test boundary.
it("exposes the production SQL adapter used by the importer", () => {
  expect(importer).toHaveProperty("createPartnerImportDatabase");
});

describe.skipIf(!url)("partner import on the allowlisted isolated Neon database (mock storage)", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("PRODUCTION_TEST_PROHIBITED");
    pool = new Pool({connectionString: url!});
    const sentinel = await pool.query("SELECT count(*)::int AS count FROM acceptance_sentinel");
    expect(sentinel.rows).toEqual([{count: 1}]);
    await pool.query("INSERT INTO profiles (id,auth_user_id,role,display_name,email) VALUES ($1,$1,'staff','Synthetic partner import staff',$2)", [actorId, `${run}@example.test`]);
    png = await sharp({create: {width: 8, height: 8, channels: 4, background: "#176e90"}}).png().toBuffer();
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    try {
      // Exact run-owned keys only; preserve all pre-existing test fixtures.
      await pool.query("DELETE FROM audit_events WHERE actor_user_id = $1", [actorId]);
      await pool.query("DELETE FROM partners WHERE logo_media_id IN (SELECT id FROM media WHERE registered_by_profile_id = $1)", [actorId]);
      await pool.query("DELETE FROM media WHERE registered_by_profile_id = $1", [actorId]);
      await pool.query("DELETE FROM profiles WHERE id = $1 AND email = $2", [actorId, `${run}@example.test`]);
    } finally { await pool.end(); }
  }, 30_000);

  function dependencies(): importer.PartnerImportDependencies {
    return {
      ...importer.createPartnerImportDatabase(pool),
      readLogoBytes: async () => png,
      normalizeImage: normalizeImageUpload,
      // Explicit mock: no R2 requests, keys or buckets are used.
      uploadLogo: vi.fn(async () => ({etag: "mock-storage-only"})),
      generateId: randomUUID,
      log: vi.fn(),
    };
  }

  it("imports 79 audited unpublished rows and skips all 79 on a sequential rerun", async () => {
    const verifiedActor = await assertPartnerImportAuthorized({WISETECH_PARTNER_IMPORT: "true", WISETECH_IMPORT_ACTOR_PROFILE_ID: actorId, WISETECH_IMPORT_ACTOR_KIND: "staff"},
      async () => (await pool.query("SELECT count(*)::int AS count FROM acceptance_sentinel")).rows[0].count,
      async (id) => (await pool.query("SELECT role FROM profiles WHERE id = $1", [id])).rows[0]?.role ?? null);
    const deps = dependencies();
    expect(await importer.importPartners(donor, new Map(), verifiedActor, deps)).toEqual({created: 79, skippedExisting: 0, skippedError: 0});
    const counts = await pool.query("SELECT category::text, count(*)::int AS count FROM partners WHERE logo_media_id IN (SELECT id FROM media WHERE registered_by_profile_id = $1) GROUP BY category ORDER BY category::text", [actorId]);
    expect(counts.rows).toEqual([{category: "media", count: 6}, {category: "regional", count: 15}, {category: "supporting", count: 58}]);
    const readiness = await pool.query("SELECT count(*)::int AS count FROM partners WHERE logo_media_id IN (SELECT id FROM media WHERE registered_by_profile_id = $1) AND published_at IS NULL AND relationship_confirmed_at IS NULL AND logo_rights_confirmed_at IS NULL", [actorId]);
    expect(readiness.rows).toEqual([{count: 79}]);
    const audit = await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE actor_user_id = $1 AND action = 'partner.created'", [actorId]);
    expect(audit.rows).toEqual([{count: 79}]);
    const media = await pool.query("SELECT count(*)::int AS count FROM media WHERE registered_by_profile_id = $1 AND checksum_sha256 IS NOT NULL AND width = 8 AND height = 8 AND alt_en <> '' AND alt_zh <> ''", [actorId]);
    expect(media.rows).toEqual([{count: 79}]);
    expect(deps.uploadLogo).toHaveBeenCalledTimes(79);
    expect(await importer.importPartners(donor, new Map(), verifiedActor, deps)).toEqual({created: 0, skippedExisting: 79, skippedError: 0});
    expect(deps.uploadLogo).toHaveBeenCalledTimes(79);
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE actor_user_id = $1", [actorId])).rows).toEqual([{count: 79}]);
  }, 180_000);

  it("rolls back the real media and partner inserts when the audit insert fails", async () => {
    const deps = dependencies();
    const original = deps.transaction;
    const failing = {...deps, transaction: <T>(work: Parameters<typeof original<T>>[0]) => original(async (tx) => work({...tx, insertAudit: async () => { throw new Error("SYNTHETIC_AUDIT_FAILURE"); }}))};
    expect(await importer.importPartners([{name: `${run}-rollback`, category: "media", logoFile: "rollback.png"}], new Map(), authorization, failing)).toEqual({created: 0, skippedExisting: 0, skippedError: 1});
    expect((await pool.query("SELECT count(*)::int AS count FROM media WHERE registered_by_profile_id = $1", [actorId])).rows).toEqual([{count: 79}]);
    expect((await pool.query("SELECT count(*)::int AS count FROM partners WHERE name_en = $1", [`${run}-rollback`])).rows).toEqual([{count: 0}]);
    expect(deps.uploadLogo).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("refuses a claimed role that differs from the stored operator role", async () => {
    await expect(assertPartnerImportAuthorized({WISETECH_PARTNER_IMPORT: "true", WISETECH_IMPORT_ACTOR_PROFILE_ID: actorId, WISETECH_IMPORT_ACTOR_KIND: "superadmin"},
      async () => 1,
      async (id) => (await pool.query("SELECT role FROM profiles WHERE id = $1", [id])).rows[0]?.role ?? null)).rejects.toThrow("PARTNER_IMPORT_ACTOR_MISMATCH");
  }, 30_000);
});