import {z} from "zod";

/** The archived donor module exports three named arrays; canonical arrays remain supported. */
const donorLogoFileSchema = z.string().trim().regex(/^(?:(?:supporting|regional|media)\/)?[A-Za-z0-9][A-Za-z0-9._-]*\.png$/);
const archivedLogoNameSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/);

const donorPartnerSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(["supporting", "regional", "media"]),
  website: z.string().url().optional(),
  logoFile: donorLogoFileSchema,
});
export type DonorPartner = z.output<typeof donorPartnerSchema>;

const donorPartnerFileSchema = z.array(donorPartnerSchema);
const archivedPartnerSchema = z.object({name: z.string().trim().min(1), file: archivedLogoNameSchema});
const archivedPartnerModuleSchema = z.object({
  supportingOrganisations: z.array(archivedPartnerSchema),
  regionalPartners: z.array(archivedPartnerSchema),
  mediaPartners: z.array(archivedPartnerSchema),
});

export function parseDonorPartnerFile(value: unknown): readonly DonorPartner[] {
  if (Array.isArray(value)) return donorPartnerFileSchema.parse(value);
  const archived = archivedPartnerModuleSchema.parse(value);
  return donorPartnerFileSchema.parse([
    ...archived.supportingOrganisations.map((partner) => ({name: partner.name, category: "supporting", logoFile: `supporting/${partner.file}`})),
    ...archived.regionalPartners.map((partner) => ({name: partner.name, category: "regional", logoFile: `regional/${partner.file}`})),
    ...archived.mediaPartners.map((partner) => ({name: partner.name, category: "media", logoFile: `media/${partner.file}`})),
  ]);
}

function splitCsvLine(line: string): readonly string[] {
  return line.split(",").map((cell) => cell.trim());
}

/**
 * Deliberately minimal: two required columns, no quoting/escaping support.
 * This sidecar is authored by hand by a human filling in a small number of
 * known Chinese names, not machine-generated -- a fuller CSV parser is not
 * warranted for that use case. Errors report the 1-based line number from
 * the original file text (not the post-filter row index), so a blank line
 * elsewhere in the file doesn't throw off which line a maintainer jumps to.
 */
export function parseZhNameSidecar(csvText: string): ReadonlyMap<string, string> {
  const numberedLines = csvText
    .split(/\r?\n/)
    .map((content, index) => ({lineNumber: index + 1, content}))
    .filter((line) => line.content.trim().length > 0);
  if (numberedLines.length === 0) {
    throw new Error("PARTNER_IMPORT_ZH_CSV_INVALID: row 1: file is empty");
  }

  const headerRow = numberedLines[0]!;
  const header = splitCsvLine(headerRow.content);
  if (header.length !== 2 || header[0] !== "name_en" || header[1] !== "name_zh_hk") {
    throw new Error(
      `PARTNER_IMPORT_ZH_CSV_INVALID: row ${headerRow.lineNumber}: expected header ` +
        `"name_en,name_zh_hk", got "${headerRow.content}"`,
    );
  }

  const map = new Map<string, string>();
  for (const row of numberedLines.slice(1)) {
    const cells = splitCsvLine(row.content);
    if (cells.length !== 2 || !cells[0] || !cells[1]) {
      throw new Error(
        `PARTNER_IMPORT_ZH_CSV_INVALID: row ${row.lineNumber}: expected 2 non-blank cells ` +
          `(name_en,name_zh_hk), got "${row.content}"`,
      );
    }
    map.set(cells[0], cells[1]);
  }
  return map;
}

export function resolveZhName(nameEn: string, sidecar: ReadonlyMap<string, string>): string {
  return sidecar.get(nameEn) ?? nameEn;
}
