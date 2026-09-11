import type {SegmentAudienceRow} from "@/lib/admin/segments";

/**
 * C-6. One header for both arms of the audience. `kind` leads it because the
 * remaining columns are only interpretable once you know which arm a row came
 * from: `planCode`/`membershipStatus`/`renewalAt`/`score` are always blank for a
 * contact, and `contactStage`/`contactSource` are always blank for a member.
 * `id` replaced `profileId` when the export learned to carry contacts — a
 * contact id is not a profile id, and a column that silently held either would
 * be pasted straight back into the wrong lookup.
 */
const header = [
  "kind", "id", "displayName", "email", "companyName", "planCode", "membershipStatus", "renewalAt", "score",
  "whatsappNumber", "whatsappOptIn", "contactStage", "contactSource",
] as const;

function neutralizeFormula(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const normalized = neutralizeFormula(String(value));
  return /[",\r\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function encodeAudienceCsv(rows: readonly SegmentAudienceRow[], includeHeader = true): string {
  const lines = rows.map((row) => [
    row.kind,
    row.id,
    row.displayName,
    row.email,
    row.companyName,
    row.planCode,
    row.membershipStatus,
    row.renewalAt,
    row.score,
    row.whatsappNumber,
    // Spelled rather than coerced: `String(false)` is "false" but
    // `csvCell(false)` would not type-check, and a blank cell for "not opted
    // in" reads as "unknown" to whoever opens the sheet.
    row.whatsappOptIn ? "true" : "false",
    row.contactStage,
    row.contactSource,
  ].map(csvCell).join(","));
  const output = [...(includeHeader ? [header.join(",")] : []), ...lines].join("\r\n");
  return `${includeHeader ? "﻿" : ""}${output}${output ? "\r\n" : ""}`;
}
