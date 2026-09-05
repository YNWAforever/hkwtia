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
