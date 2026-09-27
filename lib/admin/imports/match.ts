import type {ImportValidationRow} from "@/lib/admin/imports/validate";
export type ImportMatchFacts = Readonly<{profile: {id: string; role: string; email: string | null; locale: string; updatedAt: string; tags: readonly string[]; ownerProfileId: string | null} | null; emailProfileIds: readonly string[]; emailContactIds: readonly string[]; ownerRole: string | null}>;
export type MatchedImportRow = Readonly<{rowNumber: number; status: "create" | "update" | "unchanged" | "duplicate" | "conflict" | "invalid"; values: Readonly<Record<string, unknown>>; targetId: string | null; expectedVersion: string | null; reason: string | null; before: Readonly<Record<string, unknown>>}>;
export function matchMemberImportRow(row: ImportValidationRow, facts: ImportMatchFacts): MatchedImportRow {
  const base = {rowNumber: row.rowNumber, values: row.values, targetId: null, expectedVersion: null, before: {}};
  const answer = (status: MatchedImportRow["status"], reason: string | null, targetId: string | null = null, expectedVersion: string | null = null, before: Readonly<Record<string, unknown>> = {}): MatchedImportRow => ({...base, status, reason, targetId, expectedVersion, before});
  if (row.status === "invalid" || row.status === "duplicate") return answer(row.status, row.reasons[0] ?? null);
  if (row.values.ownerProfileId && !["staff", "exco", "superadmin"].includes(facts.ownerRole ?? "")) return answer("conflict", "OWNER_NOT_STAFF");
  const profileId = typeof row.values.profileId === "string" ? row.values.profileId : null;
  const email = typeof row.values.email === "string" ? row.values.email : null;
  if (!profileId) {
    if (!email) return answer("invalid", "IDENTITY_MISSING");
    if (facts.emailProfileIds.length || facts.emailContactIds.length) return answer("conflict", "EMAIL_CANDIDATE_REVIEW");
    return answer("create", null);
  }
  const profile = facts.profile;
  if (!profile || profile.id !== profileId || profile.role !== "member") return answer("conflict", "PROFILE_ID_NOT_MEMBER");
  if (email && profile.email?.toLocaleLowerCase("en") !== email.toLocaleLowerCase("en")) return answer("conflict", "EMAIL_IDENTITY_CONFLICT");
  if (row.values.displayName) return answer("conflict", "NAME_REQUIRES_REVIEW");
  const changedLocale = row.values.locale !== undefined && row.values.locale !== profile.locale;
  const desiredTags = Array.isArray(row.values.tags) ? row.values.tags : null;
  const changedTags = desiredTags !== null && JSON.stringify(desiredTags) !== JSON.stringify(profile.tags);
  const changedOwner = row.values.ownerProfileId !== undefined && row.values.ownerProfileId !== profile.ownerProfileId;
  if (!changedLocale && !changedTags && !changedOwner) return answer("unchanged", row.values.planCode || row.values.renewalAt ? "RECOMMENDATION_ONLY" : "NO_ALLOWED_CHANGE", profileId, profile.updatedAt, {locale: profile.locale, tags: profile.tags, ownerProfileId: profile.ownerProfileId});
  return answer("update", null, profileId, profile.updatedAt, {locale: profile.locale, tags: profile.tags, ownerProfileId: profile.ownerProfileId});
}
