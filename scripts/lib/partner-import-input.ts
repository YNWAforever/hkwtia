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
