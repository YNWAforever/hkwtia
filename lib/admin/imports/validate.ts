import {z} from "zod";

import {decideMembershipImport, isLegacyMemberKey, normaliseMappedMembershipFields} from "@/lib/admin/imports/membership-decision";
import type {ParsedMemberImport} from "@/lib/admin/imports/parse";

export const importMappingSchema = z.object({profileId: z.string().min(1).max(100).optional(), displayName: z.string().min(1).max(100).optional(), email: z.string().min(1).max(100).optional(), locale: z.string().min(1).max(100).optional(), tier: z.string().min(1).max(100).optional(), membershipStatus: z.string().min(1).max(100).optional(), expiryAt: z.string().min(1).max(100).optional(), renewAt: z.string().min(1).max(100).optional(), joinedAt: z.string().min(1).max(100).optional(), legacyMemberId: z.string().min(1).max(100).optional(), planCode: z.string().min(1).max(100).optional(), renewalAt: z.string().min(1).max(100).optional(), tags: z.string().min(1).max(100).optional(), ownerProfileId: z.string().min(1).max(100).optional()}).strict().refine((mapping) => !!(mapping.profileId || mapping.email), "IMPORT_IDENTITY_MAPPING_REQUIRED");
export type ImportMapping = z.infer<typeof importMappingSchema>;
export type ImportValidationRow = Readonly<{rowNumber: number; status: "update_candidate" | "new_contact_candidate" | "duplicate" | "invalid"; reasons: readonly string[]; values: Readonly<Record<string, unknown>>}>;

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

const DATE_FIELDS = ["renewalAt", "expiryAt", "renewAt", "joinedAt"] as const;

/** Validation is advisory. Matching and commit still re-read trusted profile/contact rows in the database. */
export function validateMemberImportRows(parsed: ParsedMemberImport, input: ImportMapping, options: Readonly<{membershipWrites?: boolean}> = {}): readonly ImportValidationRow[] {
  const mapping = importMappingSchema.parse(input);
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length || columns.some((column) => !parsed.headers.includes(column))) throw new Error("IMPORT_MAPPING_INVALID");
  const seenEmails = new Set<string>();
  return parsed.rows.map((row) => {
    const values: Record<string, unknown> = {};
    const reasons: string[] = [];
    for (const [field, column] of Object.entries(mapping)) {
      if (!column) continue;
      const value = row.cells[column]?.trim() ?? "";
      if (value) values[field] = value;
    }
    const profileId = values.profileId;
    if (profileId !== undefined && (typeof profileId !== "string" || profileId.length > 200)) reasons.push("PROFILE_ID_INVALID");
    // IN00001-style register keys are not profiles.id. Mapping that column onto the trusted member id must not look up or create a profile.
    if (typeof profileId === "string" && isLegacyMemberKey(profileId)) reasons.push("LEGACY_MEMBER_ID_NOT_PROFILE");
    const name = values.displayName;
    if (name !== undefined && (typeof name !== "string" || name.length > 200)) reasons.push("DISPLAY_NAME_INVALID");
    const email = values.email;
    if (email !== undefined) {
      const normalized = String(email).toLocaleLowerCase("en");
      values.email = normalized;
      if (!z.string().email().max(320).safeParse(normalized).success) reasons.push("EMAIL_INVALID");
      else if (seenEmails.has(normalized)) reasons.push("DUPLICATE_EMAIL");
      seenEmails.add(normalized);
    }
    if (!profileId && !email) reasons.push("IDENTITY_MISSING");
    if (values.locale !== undefined && values.locale !== "en" && values.locale !== "zh-HK") reasons.push("LOCALE_INVALID");
    normaliseMappedMembershipFields(values, reasons);
    if (DATE_FIELDS.some((field) => values[field] !== undefined && !validDay(String(values[field])))) reasons.push("DATE_INVALID");
    if (values.legacyMemberId !== undefined && String(values.legacyMemberId).length > 64) reasons.push("LEGACY_MEMBER_ID_INVALID");
    if (options.membershipWrites) {
      const decision = decideMembershipImport(values);
      values.membershipDecision = decision;
      if (decision.outcome === "skipped" && decision.reason) reasons.push(decision.reason);
    }
    if (values.tags !== undefined) {
      const tags = String(values.tags).split(";").map((value) => value.trim()).filter(Boolean);
      if (tags.length > 10 || tags.some((tag) => tag.length > 30)) reasons.push("TAGS_INVALID");
      else values.tags = [...new Set(tags)];
    }
    if (values.ownerProfileId !== undefined && String(values.ownerProfileId).length > 200) reasons.push("OWNER_INVALID");
    const status = reasons.includes("DUPLICATE_EMAIL") ? "duplicate" : reasons.length ? "invalid" : profileId ? "update_candidate" : "new_contact_candidate";
    return {rowNumber: row.rowNumber, status, reasons, values};
  });
}
