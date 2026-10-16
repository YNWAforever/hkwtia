# WP-5 Content & Asset Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tooling that lets the 79 donor partner records reach production only through an audited, rights-confirmed CMS pipeline — the import script, its authorization guard, RED tests, a staff runbook, and one new staff-editable copy field — without ever running the script against a real database, uploading real donor photography, or fabricating real Chinese names.

**Architecture:** A standalone `tsx`-run script (never wired into `npm run db:seed`) that reads donor partner data and logo files, validates and uploads each logo through the existing media pipeline, and inserts unpublished/unconfirmed rows via raw parameterized SQL over a `pg.Pool` — following `scripts/seed-m5.ts`'s exact established shape, not the Next-specific Drizzle `getDb()` path. A small, separately-testable authorization guard gates the whole thing. A new `MarketingExtras` page-copy namespace makes the one marketing string (footer tagline) that doesn't already live in an editable namespace staff-editable, without touching the deliberately-excluded `Footer` namespace.

**Tech Stack:** TypeScript, `pg` (raw SQL, no ORM), `tsx` script runner, Zod validation, Vitest, the existing `lib/media/image-upload.ts` (`normalizeImageUpload`) and `lib/media/r2-storage.ts` (`createR2Storage`) pipeline, `lib/i18n/page-copy-scope.ts`.

---

## Repo facts this plan relies on (verified against `origin/main` at commit `9b3211a`, which includes merged WP-4)

- `partners` table columns (snake_case): `id, name_en, name_zh_hk, category, website_url, logo_media_id, display_order, featured, relationship_starts_on, relationship_ends_on, relationship_confirmed_at, logo_rights_confirmed_at, published_at, archived_at, created_at, updated_at`. `category` is the Postgres enum `partner_category` with values `supporting, media, regional, programme, sponsor` (`lib/db/schema-core.ts:91`).
- `media` table columns: `id, url, alt_en, alt_zh, storage_key, storage_etag, original_filename, content_type, byte_size, width, height, focal_x, focal_y, checksum_sha256, registered_by_profile_id, archived_at, created_at, updated_at`. `url` has a unique index; real uploaded media rows use `url = '/api/media/' + id` (`lib/media/url.ts`'s `isPrivateMediaDeliveryUrl` regex expects this exact shape).
- `audit_events` table columns: `id, actor_user_id, actor_type, action, target_type, target_id, request_id, metadata, created_at`. `actor_user_id` references `profiles.id`, which is `text` (**not** UUID-shaped — it's an opaque Stack-Auth-style id), so a profile-id env var must be validated as "non-empty trimmed string," not a UUID regex.
- `scripts/seed-m5.ts` uses raw `pg.Pool` + hand-written parameterized SQL, **not** Drizzle's `getDb()` — the master plan explicitly names this file as the shape to follow. This plan follows it exactly rather than reaching for Drizzle, even though Drizzle would also work technically.
- `scripts/lib/acceptance-guard.ts` exports `assertIsolatedSeedEnvironment` (hard-forbids production — **not reusable here**, since this script must be able to run against production once rights are confirmed) and `assertSeedSentinel(prefix, countSentinelRows)` (throws distinct codes for zero/ambiguous/unreadable sentinel rows). This plan's own guard reimplements the sentinel-outcome logic with a signature that lets "not disposable" be a soft branch (checked against an explicit production override) rather than `assertSeedSentinel`'s hard-fail-always shape.
- `lib/media/image-upload.ts` exports `normalizeImageUpload(bytes, declaredContentType, fieldInput, dependencies?)` → `NormalizedImageUpload` (`{filename, altEn, altZh, focalX, focalY, bytes, contentType, width, height, byteSize, sha256, objectKey}`). `lib/media/r2-storage.ts` exports `createR2Storage(options?)` → `{put, delete, get}`; `put({key, bytes, contentType, sha256})` → `{etag}`. Both files start with `import "server-only"`, which only throws when `typeof window !== "undefined"` — safe to import from a plain Node/`tsx` script.
- `lib/i18n/page-copy-scope.ts` exports `pageCopyNamespaces` (a fixed tuple, hard-coded allowlist) and `pageCopyRoutes` (`Record<PageCopyNamespace, readonly PublicRoute[]>`). `config/public-routes.ts` exports `publicRoutes` (19 routes) and `PublicRoute`. `tests/unit/page-copy-scope.test.ts` pins `pageCopyCatalogSizes()`'s exact object and total — this plan's Task 6 must update both, following the file's own established comment style (cite which task added which fields and why).
- `package.json`'s script naming convention for one-off content-import tools (not seeds): `"content:program-images": "tsx scripts/download-program-images.ts"`. This plan adds `"content:import-wisetech-partners"` following that same prefix.

---

## Task 1: Authorization guard

**Files:**
- Create: `scripts/lib/partner-import-guard.ts`
- Test: `tests/unit/wisetech-partner-import-guard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/wisetech-partner-import-guard.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {assertPartnerImportAuthorized} from "@/scripts/lib/partner-import-guard";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    WISETECH_PARTNER_IMPORT: "true",
    WISETECH_IMPORT_ACTOR_PROFILE_ID: "profile-abc-123",
    ...overrides,
  };
}

const disposable = async () => 1;
const notDisposable = async () => 0;
const unreadable = async () => { throw new Error("relation does not exist"); };

describe("assertPartnerImportAuthorized", () => {
  it("refuses when WISETECH_PARTNER_IMPORT is not exactly \"true\"", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_PARTNER_IMPORT: "false"}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_NOT_AUTHORIZED");
    await expect(assertPartnerImportAuthorized(env({WISETECH_PARTNER_IMPORT: undefined}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_NOT_AUTHORIZED");
  });

  it("refuses when the actor profile id is missing or blank", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_PROFILE_ID: undefined}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_REQUIRED");
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_PROFILE_ID: "   "}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_REQUIRED");
  });

  it("refuses an actor kind outside staff/exco/superadmin, and defaults to staff when unset", async () => {
    await expect(assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "member"}), disposable))
      .rejects.toThrow("PARTNER_IMPORT_ACTOR_KIND_INVALID");
    const result = await assertPartnerImportAuthorized(env(), disposable);
    expect(result.actorKind).toBe("staff");
  });

  it("accepts a confirmed-disposable database with no production override needed", async () => {
    const result = await assertPartnerImportAuthorized(env(), disposable);
    expect(result).toEqual({actorProfileId: "profile-abc-123", actorKind: "staff"});
  });

  it("accepts a non-disposable database only when WISETECH_IMPORT_ALLOW_PRODUCTION is exactly \"true\"", async () => {
    await expect(assertPartnerImportAuthorized(env(), notDisposable))
      .rejects.toThrow("PARTNER_IMPORT_PRODUCTION_NOT_CONFIRMED");
    const result = await assertPartnerImportAuthorized(
      env({WISETECH_IMPORT_ALLOW_PRODUCTION: "true"}),
      notDisposable,
    );
    expect(result.actorKind).toBe("staff");
  });

  it("treats an unreadable sentinel table as a distinct, always-fatal failure", async () => {
    await expect(assertPartnerImportAuthorized(
      env({WISETECH_IMPORT_ALLOW_PRODUCTION: "true"}),
      unreadable,
    )).rejects.toThrow("PARTNER_IMPORT_SENTINEL_CHECK_FAILED");
  });

  it("accepts an explicit staff/exco/superadmin actor kind", async () => {
    const result = await assertPartnerImportAuthorized(env({WISETECH_IMPORT_ACTOR_KIND: "superadmin"}), disposable);
    expect(result.actorKind).toBe("superadmin");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/wisetech-partner-import-guard.test.ts`
Expected: FAIL — `@/scripts/lib/partner-import-guard` does not exist yet.

- [ ] **Step 3: Implement `scripts/lib/partner-import-guard.ts`**

```ts
/**
 * Authorization for scripts/import-wisetech-partners.ts.
 *
 * This is deliberately NOT scripts/lib/acceptance-guard.ts's
 * assertIsolatedSeedEnvironment: that helper hard-forbids production, but this
 * script is explicitly meant to be runnable against production once the owner
 * has confirmed partner rights -- production is a second, explicit path here,
 * not a forbidden one.
 */

const actorKinds = ["staff", "exco", "superadmin"] as const;
export type PartnerImportActorKind = (typeof actorKinds)[number];

export type PartnerImportAuthorization = Readonly<{
  actorProfileId: string;
  actorKind: PartnerImportActorKind;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isActorKind(value: string): value is PartnerImportActorKind {
  return (actorKinds as readonly string[]).includes(value);
}

/**
 * Distinct from scripts/lib/acceptance-guard.ts's assertSeedSentinel: that
 * helper always fails when the count isn't exactly 1. Here, "not exactly 1"
 * is not fatal by itself -- it just means the caller must also supply the
 * explicit production override. An unreadable table stays fatal either way,
 * because we cannot safely reason about a database we cannot query.
 */
async function sentinelConfirmsDisposable(countSentinelRows: () => Promise<number>): Promise<boolean> {
  let rows: number;
  try {
    rows = await countSentinelRows();
  } catch (error) {
    throw new Error("PARTNER_IMPORT_SENTINEL_CHECK_FAILED", {cause: error});
  }
  return rows === 1;
}

export async function assertPartnerImportAuthorized(
  environment: Environment,
  countSentinelRows: () => Promise<number>,
): Promise<PartnerImportAuthorization> {
  const fail = (code: string): never => {
    throw new Error(code);
  };

  if (normalized(environment.WISETECH_PARTNER_IMPORT) !== "true") fail("PARTNER_IMPORT_NOT_AUTHORIZED");

  const actorProfileId = environment.WISETECH_IMPORT_ACTOR_PROFILE_ID?.trim();
  if (!actorProfileId) fail("PARTNER_IMPORT_ACTOR_REQUIRED");

  const rawActorKind = environment.WISETECH_IMPORT_ACTOR_KIND?.trim();
  const actorKind: PartnerImportActorKind = rawActorKind === undefined || rawActorKind === ""
    ? "staff"
    : (isActorKind(rawActorKind) ? rawActorKind : fail("PARTNER_IMPORT_ACTOR_KIND_INVALID"));

  const disposable = await sentinelConfirmsDisposable(countSentinelRows);
  if (!disposable && normalized(environment.WISETECH_IMPORT_ALLOW_PRODUCTION) !== "true") {
    fail("PARTNER_IMPORT_PRODUCTION_NOT_CONFIRMED");
  }

  return {actorProfileId, actorKind};
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wisetech-partner-import-guard.test.ts`
Expected: PASS, 8/8

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/partner-import-guard.ts tests/unit/wisetech-partner-import-guard.test.ts
git commit -m "$(cat <<'EOF'
feat: add the partner-import authorization guard

Distinct from assertIsolatedSeedEnvironment (which hard-forbids
production): this script is meant to be runnable against production once
partner rights are confirmed, so production is a second explicit path,
gated by WISETECH_IMPORT_ALLOW_PRODUCTION, not a forbidden one.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Donor input schema and the Chinese-name sidecar CSV

**Files:**
- Create: `scripts/lib/partner-import-input.ts`
- Test: `tests/unit/wisetech-partner-import-input.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/wisetech-partner-import-input.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {parseDonorPartnerFile, parseZhNameSidecar, resolveZhName} from "@/scripts/lib/partner-import-input";

describe("parseDonorPartnerFile", () => {
  it("accepts a well-formed donor partner array", () => {
    const parsed = parseDonorPartnerFile([
      {name: "Harbour Trade Council", category: "supporting", logoFile: "harbour-trade.png"},
      {name: "GBA Media Group", category: "media", website: "https://example.org", logoFile: "gba-media.png"},
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]!.website).toBe("https://example.org");
  });

  it("rejects an unknown category rather than silently coercing it", () => {
    expect(() => parseDonorPartnerFile([{name: "X", category: "sponsor-tier", logoFile: "x.png"}]))
      .toThrow();
  });

  it("rejects a record with no logo file reference", () => {
    expect(() => parseDonorPartnerFile([{name: "X", category: "supporting"}])).toThrow();
  });
});

describe("parseZhNameSidecar", () => {
  it("parses a two-column name_en,name_zh_hk CSV", () => {
    const map = parseZhNameSidecar("name_en,name_zh_hk\nHarbour Trade Council,港口貿易協會\n");
    expect(map.get("Harbour Trade Council")).toBe("港口貿易協會");
  });

  it("rejects a CSV missing the required header", () => {
    expect(() => parseZhNameSidecar("en,zh\nHarbour,港口\n")).toThrow("PARTNER_IMPORT_ZH_CSV_INVALID");
  });

  it("rejects a row with a blank name_en", () => {
    expect(() => parseZhNameSidecar("name_en,name_zh_hk\n,港口貿易協會\n")).toThrow("PARTNER_IMPORT_ZH_CSV_INVALID");
  });
});

describe("resolveZhName", () => {
  it("uses the sidecar's Chinese name when present", () => {
    const sidecar = new Map([["Harbour Trade Council", "港口貿易協會"]]);
    expect(resolveZhName("Harbour Trade Council", sidecar)).toBe("港口貿易協會");
  });

  it("falls back to the English name when the sidecar has no entry", () => {
    expect(resolveZhName("GBA Media Group", new Map())).toBe("GBA Media Group");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/wisetech-partner-import-input.test.ts`
Expected: FAIL — `@/scripts/lib/partner-import-input` does not exist yet.

- [ ] **Step 3: Implement `scripts/lib/partner-import-input.ts`**

```ts
import {z} from "zod";

/**
 * The donor's partnerData.ts export was not directly inspectable when this
 * schema was written (see docs/superpowers/specs/2026-09-05-wisetech-wp5-
 * content-migration-design.md's appendix). This schema encodes the master
 * plan's own description -- 58 supporting + 15 regional + 6 media = 79 -- not
 * a verified donor file shape. If the real export differs, adjust this
 * schema (not the transactional logic in import-wisetech-partners.ts) to
 * match it.
 */
const donorPartnerSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(["supporting", "regional", "media"]),
  website: z.string().url().optional(),
  logoFile: z.string().trim().min(1),
});
export type DonorPartner = z.output<typeof donorPartnerSchema>;

const donorPartnerFileSchema = z.array(donorPartnerSchema);

export function parseDonorPartnerFile(value: unknown): readonly DonorPartner[] {
  return donorPartnerFileSchema.parse(value);
}

function splitCsvLine(line: string): readonly string[] {
  return line.split(",").map((cell) => cell.trim());
}

/**
 * Deliberately minimal: two required columns, no quoting/escaping support.
 * This sidecar is authored by hand by a human filling in a small number of
 * known Chinese names, not machine-generated -- a fuller CSV parser is not
 * warranted for that use case.
 */
export function parseZhNameSidecar(csvText: string): ReadonlyMap<string, string> {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error("PARTNER_IMPORT_ZH_CSV_INVALID");

  const header = splitCsvLine(lines[0]!);
  if (header.length !== 2 || header[0] !== "name_en" || header[1] !== "name_zh_hk") {
    throw new Error("PARTNER_IMPORT_ZH_CSV_INVALID");
  }

  const map = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (cells.length !== 2 || !cells[0] || !cells[1]) throw new Error("PARTNER_IMPORT_ZH_CSV_INVALID");
    map.set(cells[0], cells[1]);
  }
  return map;
}

export function resolveZhName(nameEn: string, sidecar: ReadonlyMap<string, string>): string {
  return sidecar.get(nameEn) ?? nameEn;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wisetech-partner-import-input.test.ts`
Expected: PASS, 8/8

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/partner-import-input.ts tests/unit/wisetech-partner-import-input.test.ts
git commit -m "$(cat <<'EOF'
feat: add the donor-partner input schema and Chinese-name sidecar parser

The donor partnerData.ts shape was not directly inspectable while writing
this schema, so it encodes the master plan's own field description (name,
category in supporting/regional/media, optional website, a logo file
reference) rather than a verified donor export -- documented as an
adjustable seam, not a fabricated fact.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The import script's transactional write logic

**Files:**
- Create: `scripts/import-wisetech-partners.ts`
- Test: `tests/unit/wisetech-partner-import.test.ts`

This is the file the master plan names directly. It exports its core logic (`importPartners`) with every external effect (DB, R2 upload, image normalization, filesystem reads) passed in as a dependency, so the RED tests exercise the real transactional/idempotency/audit logic against fakes — never a real network or database call. A thin `main()` at the bottom wires the real dependencies and is not itself unit-tested (matching `scripts/seed-m5.ts`'s own split between its exported, tested `seedM5` function and its untested `main()`).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/wisetech-partner-import.test.ts`:

```ts
import {describe, expect, it, vi} from "vitest";

import {importPartners, type PartnerImportDependencies} from "@/scripts/import-wisetech-partners";

const donorPartners = [
  {name: "Harbour Trade Council", category: "supporting" as const, logoFile: "harbour-trade.png"},
  {name: "GBA Media Group", category: "media" as const, website: "https://example.org", logoFile: "gba-media.png"},
];

function fakeDependencies(overrides: Partial<PartnerImportDependencies> = {}): PartnerImportDependencies {
  const existing = new Set<string>();

  return {
    findExisting: vi.fn(async (category: string, nameEn: string) => existing.has(`${category}:${nameEn}`)),
    readLogoBytes: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    normalizeImage: vi.fn(async (_bytes, _contentType, fields) => ({
      filename: fields.filename,
      altEn: fields.altEn,
      altZh: fields.altZh,
      // NormalizedImageUpload.focalX/focalY are numbers (the parsed output); the incoming
      // fieldInput carries them as strings (normalizeImageUpload's real input shape, meant for
      // raw un-parsed form data) -- this fake must convert, not merely pass the strings through,
      // or the fake's return value would not actually satisfy NormalizedImageUpload's type.
      focalX: Number(fields.focalX),
      focalY: Number(fields.focalY),
      bytes: Buffer.from("normalized"),
      contentType: "image/png" as const,
      width: 200,
      height: 200,
      byteSize: 10,
      sha256: "deadbeef",
      objectKey: `media/2026/09/${fields.filename}`,
    })),
    uploadLogo: vi.fn(async () => ({etag: "\"fake-etag\""})),
    transaction: vi.fn(async (work) => work({
      insertMedia: async (row) => ({id: `media-generated`}),
      insertPartner: async (row) => ({id: `partner-generated`}),
      insertAudit: async (row) => {},
    })),
    generateId: vi.fn(() => `generated-id`),
    log: vi.fn(),
    ...overrides,
  };
}

describe("importPartners", () => {
  it("inserts one media row and one partner row per new donor record, in a single transaction each", async () => {
    const insertedPartners: unknown[] = [];
    const insertedMedia: unknown[] = [];
    const insertedAudit: unknown[] = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async (row) => { insertedMedia.push(row); return {id: `media-${insertedMedia.length}`}; },
        insertPartner: async (row) => { insertedPartners.push(row); return {id: `partner-${insertedPartners.length}`}; },
        insertAudit: async (row) => { insertedAudit.push(row); },
      }),
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary).toEqual({created: 2, skippedExisting: 0, skippedError: 0});
    expect(insertedMedia).toHaveLength(2);
    expect(insertedPartners).toHaveLength(2);
    expect(insertedAudit).toHaveLength(2);
  });

  it("creates rows with published_at and both confirmed_at columns unset (null)", async () => {
    const insertedPartners: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: "partner-1"}; },
        insertAudit: async () => {},
      }),
    });

    await importPartners([donorPartners[0]!], new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedPartners[0]!.publishedAt).toBeUndefined();
    expect(insertedPartners[0]!.relationshipConfirmedAt).toBeUndefined();
    expect(insertedPartners[0]!.logoRightsConfirmedAt).toBeUndefined();
  });

  it("gives the media row non-blank bilingual alt text derived from the partner name", async () => {
    const insertedMedia: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async (row) => { insertedMedia.push(row); return {id: "media-1"}; },
        insertPartner: async () => ({id: "partner-1"}),
        insertAudit: async () => {},
      }),
    });

    await importPartners([donorPartners[0]!], new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedMedia[0]!.altEn).toBe("Harbour Trade Council logo");
    expect(insertedMedia[0]!.altZh).toBe("Harbour Trade Council 標誌");
  });

  it("maps the donor's three categories onto the partners table's category enum exactly", async () => {
    const insertedPartners: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: `partner-${insertedPartners.length}`}; },
        insertAudit: async () => {},
      }),
    });

    await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedPartners[0]!.category).toBe("supporting");
    expect(insertedPartners[1]!.category).toBe("media");
  });

  it("is idempotent on (category, nameEn): a second run against the same donor data inserts 0 rows", async () => {
    const existing = new Set(["supporting:Harbour Trade Council", "media:GBA Media Group"]);
    const deps = fakeDependencies({
      findExisting: async (category, nameEn) => existing.has(`${category}:${nameEn}`),
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary).toEqual({created: 0, skippedExisting: 2, skippedError: 0});
  });

  it("resolves the Chinese name from the sidecar, falling back to English when absent", async () => {
    const insertedPartners: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: `partner-${insertedPartners.length}`}; },
        insertAudit: async () => {},
      }),
    });
    const sidecar = new Map([["Harbour Trade Council", "港口貿易協會"]]);

    await importPartners(donorPartners, sidecar, {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedPartners[0]!.nameZhHk).toBe("港口貿易協會");
    expect(insertedPartners[1]!.nameZhHk).toBe("GBA Media Group");
  });

  it("logs and skips a record whose logo fails validation, without aborting the whole run", async () => {
    let call = 0;
    const insertedPartners: unknown[] = [];
    const deps = fakeDependencies({
      normalizeImage: async () => {
        call += 1;
        if (call === 1) throw new Error("MEDIA_IMAGE_INVALID");
        return {
          filename: "gba-media.png", altEn: "x", altZh: "x", focalX: 50, focalY: 50,
          bytes: Buffer.from("ok"), contentType: "image/png" as const, width: 10, height: 10,
          byteSize: 2, sha256: "abc", objectKey: "media/2026/09/gba-media.png",
        };
      },
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: "partner-1"}; },
        insertAudit: async () => {},
      }),
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary).toEqual({created: 1, skippedExisting: 0, skippedError: 1});
    expect(insertedPartners).toHaveLength(1);
  });

  it("prints only a running count, never a name, URL, or secret", async () => {
    const logged: string[] = [];
    const deps = fakeDependencies({log: (message: string) => { logged.push(message); }});

    await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    for (const line of logged) {
      expect(line).not.toMatch(/https?:\/\//);
      expect(line).not.toContain("Harbour Trade Council");
      expect(line).not.toContain("GBA Media Group");
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/wisetech-partner-import.test.ts`
Expected: FAIL — `@/scripts/import-wisetech-partners` does not exist yet.

- [ ] **Step 3: Implement `scripts/import-wisetech-partners.ts`**

```ts
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

import {Pool} from "pg";

import {assertPartnerImportAuthorized, type PartnerImportAuthorization} from "@/scripts/lib/partner-import-guard";
import {parseDonorPartnerFile, parseZhNameSidecar, resolveZhName, type DonorPartner} from "@/scripts/lib/partner-import-input";
import {normalizeImageUpload, type NormalizedImageUpload} from "@/lib/media/image-upload";
import {createR2Storage} from "@/lib/media/r2-storage";

/**
 * The donor checkout's partner-data module is read relative to
 * WISETECH_DONOR_DIR. This exact relative path was not verified against a
 * real donor checkout while writing this script (see the design spec's
 * appendix) -- adjust it if the real donor export lives elsewhere.
 */
export const DONOR_PARTNER_DATA_RELATIVE_PATH = "partnerData.ts";
export const DONOR_LOGO_DIRECTORY_RELATIVE_PATH = "public/partners";

type MediaInsertRow = Readonly<{
  id: string;
  url: string;
  altEn: string;
  altZh: string;
  storageKey: string;
  storageEtag: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  checksumSha256: string;
  registeredByProfileId: string;
}>;

type PartnerInsertRow = Readonly<{
  nameEn: string;
  nameZhHk: string;
  category: DonorPartner["category"];
  websiteUrl: string | null;
  logoMediaId: string;
  displayOrder: number;
  featured: boolean;
}>;

type AuditInsertRow = Readonly<{
  actorUserId: string;
  actorType: PartnerImportAuthorization["actorKind"];
  action: "partner.created";
  targetType: "partner";
  targetId: string;
  metadata: Readonly<{category: DonorPartner["category"]}>;
}>;

type PartnerImportTransaction = Readonly<{
  insertMedia: (row: MediaInsertRow) => Promise<Readonly<{id: string}>>;
  insertPartner: (row: PartnerInsertRow) => Promise<Readonly<{id: string}>>;
  insertAudit: (row: AuditInsertRow) => Promise<void>;
}>;

export type PartnerImportDependencies = Readonly<{
  findExisting: (category: string, nameEn: string) => Promise<boolean>;
  readLogoBytes: (logoFile: string) => Promise<Uint8Array>;
  normalizeImage: (
    bytes: Uint8Array,
    declaredContentType: string,
    fieldInput: Readonly<{filename: string; altEn: string; altZh: string; focalX: string; focalY: string}>,
  ) => Promise<NormalizedImageUpload>;
  uploadLogo: (input: Readonly<{key: string; bytes: Uint8Array; contentType: string; sha256: string}>) => Promise<Readonly<{etag: string}>>;
  transaction: <T>(work: (tx: PartnerImportTransaction) => Promise<T>) => Promise<T>;
  generateId: () => string;
  log: (message: string) => void;
}>;

export type PartnerImportSummary = Readonly<{created: number; skippedExisting: number; skippedError: number}>;

export async function importPartners(
  donorPartners: readonly DonorPartner[],
  zhNameSidecar: ReadonlyMap<string, string>,
  authorization: PartnerImportAuthorization,
  deps: PartnerImportDependencies,
): Promise<PartnerImportSummary> {
  let created = 0;
  let skippedExisting = 0;
  let skippedError = 0;

  for (const [index, donorPartner] of donorPartners.entries()) {
    const alreadyExists = await deps.findExisting(donorPartner.category, donorPartner.name);
    if (alreadyExists) {
      skippedExisting += 1;
      continue;
    }

    try {
      const mediaId = deps.generateId();
      const rawBytes = await deps.readLogoBytes(donorPartner.logoFile);
      const normalized = await deps.normalizeImage(rawBytes, "image/png", {
        filename: donorPartner.logoFile,
        altEn: `${donorPartner.name} logo`,
        altZh: `${donorPartner.name} 標誌`,
        focalX: "50",
        focalY: "50",
      });
      const upload = await deps.uploadLogo({
        key: normalized.objectKey,
        bytes: normalized.bytes,
        contentType: normalized.contentType,
        sha256: normalized.sha256,
      });

      await deps.transaction(async (tx) => {
        const media = await tx.insertMedia({
          id: mediaId,
          url: `/api/media/${mediaId}`,
          altEn: normalized.altEn,
          altZh: normalized.altZh,
          storageKey: normalized.objectKey,
          storageEtag: upload.etag,
          originalFilename: normalized.filename,
          contentType: normalized.contentType,
          byteSize: normalized.byteSize,
          width: normalized.width,
          height: normalized.height,
          focalX: normalized.focalX,
          focalY: normalized.focalY,
          checksumSha256: normalized.sha256,
          registeredByProfileId: authorization.actorProfileId,
        });

        const partner = await tx.insertPartner({
          nameEn: donorPartner.name,
          nameZhHk: resolveZhName(donorPartner.name, zhNameSidecar),
          category: donorPartner.category,
          websiteUrl: donorPartner.website ?? null,
          logoMediaId: media.id,
          displayOrder: index,
          featured: false,
        });

        await tx.insertAudit({
          actorUserId: authorization.actorProfileId,
          actorType: authorization.actorKind,
          action: "partner.created",
          targetType: "partner",
          targetId: partner.id,
          metadata: {category: donorPartner.category},
        });
      });

      created += 1;
    } catch (error) {
      skippedError += 1;
      deps.log(`skipped one record: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  deps.log(`created=${created} skippedExisting=${skippedExisting} skippedError=${skippedError}`);
  return {created, skippedExisting, skippedError};
}

async function main(): Promise<void> {
  const donorDir = process.env.WISETECH_DONOR_DIR;
  if (!donorDir) throw new Error("PARTNER_IMPORT_DONOR_DIR_REQUIRED");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PARTNER_IMPORT_DATABASE_URL_REQUIRED");

  const pool = new Pool({connectionString: databaseUrl});
  try {
    const authorization = await assertPartnerImportAuthorized(process.env, async () => {
      const result = await pool.query("SELECT count(*)::int AS count FROM acceptance_sentinel");
      return Number(result.rows[0]?.count ?? 0);
    });

    const donorModule = await import(join(donorDir, DONOR_PARTNER_DATA_RELATIVE_PATH));
    const donorPartners = parseDonorPartnerFile(donorModule.default ?? donorModule.partners);

    const zhCsvPath = process.env.WISETECH_PARTNER_ZH_NAMES_CSV;
    const zhNameSidecar = zhCsvPath
      ? parseZhNameSidecar(await readFile(zhCsvPath, "utf8"))
      : new Map<string, string>();

    const r2 = createR2Storage();

    const dependencies: PartnerImportDependencies = {
      findExisting: async (category, nameEn) => {
        const result = await pool.query(
          "SELECT 1 FROM partners WHERE category = $1 AND name_en = $2 LIMIT 1",
          [category, nameEn],
        );
        return result.rowCount !== null && result.rowCount > 0;
      },
      readLogoBytes: async (logoFile) => new Uint8Array(await readFile(join(donorDir, DONOR_LOGO_DIRECTORY_RELATIVE_PATH, logoFile))),
      normalizeImage: (bytes, contentType, fieldInput) => normalizeImageUpload(bytes, contentType, fieldInput),
      uploadLogo: (input) => r2.put({key: input.key, bytes: input.bytes as Uint8Array, contentType: input.contentType as never, sha256: input.sha256}),
      transaction: async (work) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work({
            insertMedia: async (row) => {
              const inserted = await client.query(
                `INSERT INTO media (id, url, alt_en, alt_zh, storage_key, storage_etag, original_filename, content_type, byte_size, width, height, focal_x, focal_y, checksum_sha256, registered_by_profile_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
                [row.id, row.url, row.altEn, row.altZh, row.storageKey, row.storageEtag, row.originalFilename, row.contentType, row.byteSize, row.width, row.height, row.focalX, row.focalY, row.checksumSha256, row.registeredByProfileId],
              );
              return {id: inserted.rows[0].id};
            },
            insertPartner: async (row) => {
              const inserted = await client.query(
                `INSERT INTO partners (name_en, name_zh_hk, category, website_url, logo_media_id, display_order, featured)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                [row.nameEn, row.nameZhHk, row.category, row.websiteUrl, row.logoMediaId, row.displayOrder, row.featured],
              );
              return {id: inserted.rows[0].id};
            },
            insertAudit: async (row) => {
              await client.query(
                `INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [row.actorUserId, row.actorType, row.action, row.targetType, row.targetId, JSON.stringify(row.metadata)],
              );
            },
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      generateId: randomUUID,
      log: (message) => { console.log(message); },
    };

    await importPartners(donorPartners, zhNameSidecar, authorization, dependencies);
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
// Matches scripts/seed-m5.ts's own established pattern exactly: `import.meta.url ===
// file://${process.argv[1]}` would never match on Windows (backslash paths vs. the URL's
// forward-slash, drive-letter-encoded form), so this repo already normalizes both sides through
// fileURLToPath and compares case-insensitively (Windows paths are case-insensitive).
if (entrypoint && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

Note: verify `createR2Storage().put`'s exact `contentType` parameter type (`MediaContentType`, a union of `"image/png" | "image/jpeg" | "image/webp"`) accepts the value coming from `normalizeImageUpload`'s own output directly — it does, since both come from the same `MediaContentType` type in `lib/media/image-upload.ts`; the `as never` cast in `uploadLogo`'s wiring above exists only because `PartnerImportDependencies`'s injected-dependency type intentionally widens `contentType` to `string` for easier test-fake construction, and is narrowed back at the real call site.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wisetech-partner-import.test.ts`
Expected: PASS, 8/8

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-wisetech-partners.ts tests/unit/wisetech-partner-import.test.ts
git commit -m "$(cat <<'EOF'
feat: add scripts/import-wisetech-partners.ts

Follows scripts/seed-m5.ts's own established shape (raw pg.Pool, hand-
written parameterized SQL, no Drizzle) rather than the Next-specific
getDb() path. importPartners() takes every external effect as an injected
dependency, so its transactional/idempotency/audit logic is fully unit-
tested against fakes; main() wires the real pg/R2/filesystem dependencies
and is not itself unit-tested, matching seed-m5.ts's own split. Never run
against a real database as part of this change -- the guard from the
previous commit still refuses without explicit authorization either way.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `package.json` script entry

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script entry**

In `package.json`'s `"scripts"` object, add (following the `content:program-images` naming precedent for one-off content-import tools, distinct from the `db:seed:*` family since this is not a seed):

```json
"content:import-wisetech-partners": "tsx scripts/import-wisetech-partners.ts",
```

- [ ] **Step 2: Confirm the script is wired correctly without running it**

Run: `node -e "const pkg = require('./package.json'); if (pkg.scripts['content:import-wisetech-partners'] !== 'tsx scripts/import-wisetech-partners.ts') throw new Error('script entry missing or wrong')"`
Expected: no output, exit code 0.

Do **not** run `npm run content:import-wisetech-partners` — this would attempt the real script, which is out of scope for this plan (no `WISETECH_DONOR_DIR`/`DATABASE_URL` are configured, and even if they were, actually executing it is explicitly out of scope per this plan's goal).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore: wire scripts/import-wisetech-partners.ts into package.json

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `MarketingExtras` page-copy namespace

**Files:**
- Modify: `lib/i18n/page-copy-scope.ts`
- Modify: `tests/unit/page-copy-scope.test.ts`

- [ ] **Step 1: Write the failing test additions**

In `tests/unit/page-copy-scope.test.ts`, change the `"keeps product UI and structural namespaces out of reach"` test's assertion for `Footer` to also confirm `MarketingExtras` is now a *different*, real namespace (append, do not remove the existing `Footer` check — `Footer` itself must still be excluded):

Find:
```ts
  it("keeps product UI and structural namespaces out of reach", () => {
    for (const namespace of ["LaunchPad", "AiOps", "Join", "Showcase", "Navigation", "Footer", "Metadata", "NotFound", "Error", "Admin", "Portal"]) {
      expect(isPageCopyNamespace(namespace), namespace).toBe(false);
    }
    expect(isPageCopyNamespace("Privacy")).toBe(true);
    expect(isPageCopyNamespace("__proto__")).toBe(false);
    expect(isPageCopyNamespace(undefined)).toBe(false);
  });
```

Replace with:
```ts
  it("keeps product UI and structural namespaces out of reach", () => {
    for (const namespace of ["LaunchPad", "AiOps", "Join", "Showcase", "Navigation", "Footer", "Metadata", "NotFound", "Error", "Admin", "Portal"]) {
      expect(isPageCopyNamespace(namespace), namespace).toBe(false);
    }
    expect(isPageCopyNamespace("Privacy")).toBe(true);
    // WP-5: Footer itself stays excluded (structural), but one specific marketing
    // string (the footer tagline) is editable via this new, narrowly-scoped namespace.
    expect(isPageCopyNamespace("MarketingExtras")).toBe(true);
    expect(isPageCopyNamespace("__proto__")).toBe(false);
    expect(isPageCopyNamespace(undefined)).toBe(false);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/page-copy-scope.test.ts -t "keeps product UI"`
Expected: FAIL — `isPageCopyNamespace("MarketingExtras")` is currently `false`.

- [ ] **Step 3: Add the namespace and its route mapping**

In `lib/i18n/page-copy-scope.ts`, find:

```ts
export const pageCopyNamespaces = [
  "Home",
  "About",
  "Chairman",
  "Committees",
  "Contact",
  "programs",
  "Membership",
  "Privacy",
  "AiTransparency",
] as const;
```

Replace with:

```ts
export const pageCopyNamespaces = [
  "Home",
  "About",
  "Chairman",
  "Committees",
  "Contact",
  "programs",
  "Membership",
  "Privacy",
  "AiTransparency",
  // WP-5: not a page namespace -- copy that renders sitewide but doesn't belong to
  // the deliberately-excluded structural Footer namespace. Keep this small; it is
  // not a place to route around Footer's own exclusion for anything else.
  "MarketingExtras",
] as const;
```

Find:

```ts
export const pageCopyRoutes: Readonly<Record<PageCopyNamespace, readonly PublicRoute[]>> = {
  Home: ["/"],
  About: ["/about"],
  Chairman: ["/about/chairman"],
  Committees: ["/about/committees"],
  Contact: ["/contact"],
  programs: ["/programs/cpai", "/programs/hkict", "/programs/tct", "/programs/asa"],
  Membership: ["/membership"],
  Privacy: ["/privacy"],
  AiTransparency: ["/ai-transparency"],
};
```

Replace with:

```ts
export const pageCopyRoutes: Readonly<Record<PageCopyNamespace, readonly PublicRoute[]>> = {
  Home: ["/"],
  About: ["/about"],
  Chairman: ["/about/chairman"],
  Committees: ["/about/committees"],
  Contact: ["/contact"],
  programs: ["/programs/cpai", "/programs/hkict", "/programs/tct", "/programs/asa"],
  Membership: ["/membership"],
  Privacy: ["/privacy"],
  AiTransparency: ["/ai-transparency"],
  // SiteFooter renders on every public route via the shared (public) layout, not
  // just "/" -- a save here must invalidate all of them.
  MarketingExtras: publicRoutes,
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/page-copy-scope.test.ts -t "keeps product UI"`
Expected: PASS

- [ ] **Step 5: Run the full page-copy-scope test file and confirm the other tests now fail for the expected reason**

Run: `npx vitest run tests/unit/page-copy-scope.test.ts`
Expected: FAIL — `"maps every editable namespace to at least one declared public route"` now fails (`MarketingExtras` has no entry in `en.json` yet, so `pageCopyCatalog` will error or return an empty list); `"every editable namespace exists in the shipped bundle"` fails (`en.json` has no `MarketingExtras` key yet); `"exposes the agreed editable surface and nothing more"` fails (pinned sizes object doesn't include `MarketingExtras` yet). This confirms Task 5's namespace addition is correctly wired to require Task 6's bundle changes before the suite is green again — do not proceed to "fix" these by reverting Task 5; Task 6 makes them pass.

- [ ] **Step 6: Commit**

```bash
git add lib/i18n/page-copy-scope.ts tests/unit/page-copy-scope.test.ts
git commit -m "$(cat <<'EOF'
feat: add the MarketingExtras page-copy namespace

Footer stays excluded (structural, per its own existing rationale) -- this
adds one small, separately-allowlisted namespace for the one marketing
string WP-5 names that doesn't already live in an editable namespace (the
footer tagline). Scoped to publicRoutes wholesale since SiteFooter renders
on every public route via the shared layout, not just "/".

The rest of the page-copy-scope suite is expected to be red until the next
commit adds the actual MarketingExtras.footerTagline bundle key.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Message bundle keys and the `SiteFooter` swap

**Files:**
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `components/layout/site-footer.tsx`
- Modify: `tests/unit/page-copy-scope.test.ts`
- Regression (must stay green): `tests/unit/messages.test.ts`, `tests/unit/site-footer.test.tsx`

- [ ] **Step 1: Read the current `Footer.tagline` value in both bundles**

Run: `node -e "console.log(require('./messages/en.json').Footer.tagline)"`
Run: `node -e "console.log(require('./messages/zh-HK.json').Footer.tagline)"`

Record both exact strings — the next step moves them verbatim, character-for-character, to the new key. Do not paraphrase or retranslate.

- [ ] **Step 2: Move the key in both bundles**

In `messages/en.json`: add a new top-level `"MarketingExtras": {"footerTagline": "<the exact value read in Step 1>"}` object (this file's top-level namespace keys are not alphabetically sorted — e.g. `Common, Metadata, Navigation, Announcement, Footer, Email, ...` — so append the new key at the end of the top-level object rather than trying to match a sort order that doesn't exist), and remove the `tagline` key from the `Footer` object.

In `messages/zh-HK.json`: the same swap, with the zh-HK value read in Step 1.

- [ ] **Step 3: Swap `SiteFooter`'s translator call**

In `components/layout/site-footer.tsx`, find:

```tsx
export async function SiteFooter({locale}: {locale: AppLocale}) {
  const [navigationT, t] = await Promise.all([
    getTranslations({locale, namespace: "Navigation"}),
    getTranslations({locale, namespace: "Footer"}),
  ]);
```

Replace with:

```tsx
export async function SiteFooter({locale}: {locale: AppLocale}) {
  const [navigationT, t, marketingT] = await Promise.all([
    getTranslations({locale, namespace: "Navigation"}),
    getTranslations({locale, namespace: "Footer"}),
    getTranslations({locale, namespace: "MarketingExtras"}),
  ]);
```

Find:

```tsx
        <strong>{t("tagline")}</strong>
```

Replace with:

```tsx
        <strong>{marketingT("footerTagline")}</strong>
```

Every other `t("...")` call in this file (brand, legalLine, columns, newsletter, summary, addressLines, privacy, copyright) is untouched and still reads from the `Footer`-namespace translator.

- [ ] **Step 4: Run the regression suite and confirm everything is green again**

Run: `npx vitest run tests/unit/page-copy-scope.test.ts tests/unit/messages.test.ts tests/unit/site-footer.test.tsx`
Expected: PASS — this is the point where Task 5's expected-red state resolves. `tests/unit/site-footer.test.tsx`'s `getTranslations` mock (in its `vi.mock("next-intl/server", ...)` block) already resolves any namespace generically by reading the real `messages/{en,zh-HK}.json` bundles at the given `namespace`/`key` — it has no fixed, hardcoded namespace list, so the new third call needs no test-mock change at all.

- [ ] **Step 5: Update the pinned `pageCopyCatalogSizes()` assertion**

In `tests/unit/page-copy-scope.test.ts`, find the `sizes` object inside `"exposes the agreed editable surface and nothing more"`. Add, immediately before the closing `});` of that object:

```ts
      // WP-5 added one editable field: the footer tagline, moved out of the
      // deliberately-excluded structural Footer namespace into this new,
      // narrowly-scoped one so it alone (not the rest of Footer) is staff-editable.
      MarketingExtras: 1,
```

Find:
```ts
    expect(Object.values(sizes).reduce((total, count) => total + count, 0)).toBe(453);
```

Replace with:
```ts
    expect(Object.values(sizes).reduce((total, count) => total + count, 0)).toBe(454);
```

- [ ] **Step 6: Run the full page-copy-scope suite and confirm it passes**

Run: `npx vitest run tests/unit/page-copy-scope.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Run `audit:strings` and the full unit suite**

Run: `npm run audit:strings`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json messages/zh-HK.json components/layout/site-footer.tsx tests/unit/page-copy-scope.test.ts tests/unit/site-footer.test.tsx
git commit -m "$(cat <<'EOF'
feat: make the footer tagline staff-editable via MarketingExtras

Footer.tagline moves verbatim (both locales, no retranslation) to the new
MarketingExtras.footerTagline key; SiteFooter reads it from there instead.
Every other Footer.* field (brand, legal line, columns, newsletter,
summary, address, privacy, copyright) is untouched and stays non-editable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Staff runbook

**Files:**
- Create: `docs/integration/wisetech-partner-import-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/integration/wisetech-partner-import-runbook.md`:

```markdown
# WiseTech Partner Import — Staff Runbook

This runbook covers running `scripts/import-wisetech-partners.ts` and confirming rights for the imported records. It does not cover archive photography (see §3) or writing the script itself (see `docs/superpowers/plans/2026-09-05-wisetech-wp5-content-migration.md`).

## 1. Before you run anything

The script refuses to run without:

- `WISETECH_PARTNER_IMPORT=true`
- `WISETECH_IMPORT_ACTOR_PROFILE_ID=<your profiles.id>` — every row this run creates is attributed to this profile in `audit_events`. Use your own profile id, not a shared or placeholder one.
- `WISETECH_IMPORT_ACTOR_KIND` — one of `staff`, `exco`, `superadmin` (defaults to `staff` if unset).
- Either the target database has a real `acceptance_sentinel` row (a disposable database provisioned for this purpose), **or** you explicitly set `WISETECH_IMPORT_ALLOW_PRODUCTION=true`. Only set this against the real production database once you have actually decided to import the real records there — there is no dry-run mode.
- `WISETECH_DONOR_DIR=<path to the donor checkout>` — must contain the donor's partner data file and `public/partners/**` logo files.
- `DATABASE_URL=<the target database>`.

Optional: `WISETECH_PARTNER_ZH_NAMES_CSV=<path to a name_en,name_zh_hk CSV>` — supply Chinese names for as many partners as you have them for. Any partner not listed keeps its English name as a placeholder `name_zh_hk` until you edit it in `/admin/partners`.

## 2. Running the import

```sh
npm run content:import-wisetech-partners
```

The script prints only a running count (`created=N skippedExisting=N skippedError=N`) — never a partner name, a URL, or a secret. Every created row is a real, insertable, but **unpublished and unconfirmed** partner: no visitor can see it yet, and the repo (`lib/db/repos/partners.ts`) refuses to publish it until both confirmations below exist.

Running the script again against the same donor data is safe — it detects existing `(category, name_en)` pairs and creates nothing for them.

## 3. Confirming rights, per partner

For each newly-imported partner, in `/admin/partners/[id]`:

1. Confirm the **relationship window** — when this organisation was (or still is) a real WTIA partner. Set `relationshipStartsOn`/`relationshipEndsOn` if the relationship has a known end date; leave `relationshipEndsOn` unset if it's ongoing.
2. Confirm the **logo rights** — that WTIA is authorised to display this organisation's logo on the public site. This is a real legal/relationship confirmation, not a formality — do not confirm it without actually checking.
3. Once both are confirmed, the **Publish** action becomes available. Publishing is what makes the partner visible on `/partners` and the homepage wall.

Archive photography (the six donor `.webp` files, currently `retire` in `config/wisetech-authoritative-source-inventory.ts`) follows the same rights-confirmation principle but a different mechanism: once you've confirmed usage rights for one of those photos, upload it directly via `/admin/media` (bilingual alt text required) and reference it from the relevant page copy. There is no import script for this — `/admin/media` is already the correct, existing upload path.

## 4. After rights are confirmed for an asset

If you've confirmed rights for a specific archive photo or a class of partner logos such that `config/wisetech-authoritative-source-inventory.ts`'s disposition for that asset should change from `retire` to `merge`, that change:

- happens in its own commit,
- names the confirmation reference (who confirmed, when, and how) in the commit message,
- is reviewed like any other code change.

This runbook does not perform that step — it is a deliberate, one-at-a-time decision, not something the import script or this document should ever do automatically.
```

- [ ] **Step 2: Commit**

```bash
git add docs/integration/wisetech-partner-import-runbook.md
git commit -m "$(cat <<'EOF'
docs: write the WiseTech partner-import staff runbook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Whole-branch regression gate

**Files:** none created — verification only.

- [ ] **Step 1: Confirm the worktree is clean of auto-regenerated files**

Run: `git status --porcelain -- AGENTS.md next-env.d.ts`
Expected: if either shows modified, run `git checkout -- AGENTS.md next-env.d.ts` before proceeding.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: PASS, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: String audit**

Run: `npm run audit:strings`
Expected: PASS.

- [ ] **Step 6: Confirm the import script was never actually executed**

Run: `git log --oneline --all -- scripts/import-wisetech-partners.ts`
Manually confirm no commit message or CI log in this branch's history shows a real run (no `WISETECH_DONOR_DIR`/`DATABASE_URL` were ever set against a real target during this plan's execution). This is a manual confirmation step, not an automated one — there is no test that can prove a script was never run against an external database.

- [ ] **Step 7: Review the diff**

Run: `git status` and `git diff --stat main...HEAD` (or the equivalent against whatever this branch's actual merge-base is — confirm via `git merge-base HEAD origin/main` first).
Expected: every changed file matches what Tasks 1–7 described touching; nothing else.

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: WP-5 content-migration tooling (partner import script, guard, runbook)" --body "$(cat <<'EOF'
## Summary

- `scripts/import-wisetech-partners.ts` + `scripts/lib/partner-import-guard.ts`: a standalone, tsx-run script that imports the donor's partner records as unpublished, unconfirmed rows, gated by an authorization guard distinct from the seed guards (this one can legitimately run against production once rights are confirmed, unlike `assertIsolatedSeedEnvironment`).
- `scripts/lib/partner-import-input.ts`: the donor-partner Zod schema and an optional sidecar CSV for Chinese partner names, both designed to be adjusted by whoever runs the real import rather than pinned to unverified donor internals.
- `docs/integration/wisetech-partner-import-runbook.md`: the staff process for running the script and confirming rights per partner before publication.
- A new `MarketingExtras` page-copy namespace makes the footer tagline staff-editable without widening the deliberately-excluded `Footer` namespace.
- **This PR never executes the import script against any database, uploads any real donor photography, flips any asset's `retire`→`merge` disposition, or supplies real Chinese partner names.** Those remain owner-only actions, per the master plan's own "2 days + staff review time" framing.

## Test plan

- [x] `npx vitest run` — full unit suite green
- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean
- [x] `npm run audit:strings` — clean
- [x] The import script was never run against a real or disposable database as part of this change

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back once created.
