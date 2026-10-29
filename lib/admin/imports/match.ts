import {membershipDecisionRequiresWrite, readMembershipDecision, type MembershipImportDecision} from "@/lib/admin/imports/membership-decision";
import type {ImportValidationRow} from "@/lib/admin/imports/validate";

export type ImportEmailContact = Readonly<{id: string; source: string; profileId: string | null; displayName: string | null; locale: string; stage: string; ownerProfileId: string | null; tags: readonly string[]}>;
export type ImportEmailProfile = Readonly<{id: string; role: string; displayName: string; locale: string; directoryVisible: boolean; authUserId: string | null}>;
export type ImportEmailMembership = Readonly<{ownerUserId: string; planCode: string; status: string; billingPeriodStart: string | null; billingPeriodEnd: string | null}>;
export type ImportMatchFacts = Readonly<{profile: {id: string; role: string; email: string | null; locale: string; updatedAt: string; tags: readonly string[]; ownerProfileId: string | null} | null; emailProfileIds: readonly string[]; emailContactIds: readonly string[]; ownerRole: string | null; emailContacts?: readonly ImportEmailContact[]; emailProfiles?: readonly ImportEmailProfile[]; emailMemberships?: readonly ImportEmailMembership[]}>;

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function expectedStage(decision: MembershipImportDecision | null): "member" | "closed" | "new" {
  if (decision?.outcome === "would_create_membership") return "member";
  if (decision?.outcome === "would_set_expired") return "closed";
  return "new";
}

function membershipTargetMatches(profileId: string, decision: MembershipImportDecision, memberships: readonly ImportEmailMembership[]): boolean {
  if (!decision.planCode || !decision.membershipStatus) return false;
  const owned = memberships.filter((row) => row.ownerUserId === profileId);
  const live = owned.find((row) => row.status !== "cancelled" && row.status !== "expired");
  const expired = owned.find((row) => row.status === "expired");
  const target = decision.membershipStatus === "active" ? live : live ?? expired;
  return Boolean(target && target.planCode === decision.planCode && target.status === decision.membershipStatus && target.billingPeriodStart === decision.billingPeriodStart && target.billingPeriodEnd === decision.billingPeriodEnd);
}

/**
 * A second validation of a file that already committed used to report every
 * email as EMAIL_CANDIDATE_REVIEW. Commit would skip those rows, but the
 * preview looked like a pile of manual conflicts. An import-origin contact
 * whose stored fields still match the file is unchanged. A profile that was
 * not created as that contact's hidden shell stays a conflict, and so does
 * an import shell whose name, locale, stage, or membership no longer matches.
 */
function priorImportUnchanged(values: Readonly<Record<string, unknown>>, facts: ImportMatchFacts): boolean {
  if (!facts.emailContacts || !facts.emailProfiles || !facts.emailMemberships) return false;
  const email = typeof values.email === "string" ? values.email : "";
  if (!email || facts.emailContacts.length !== 1) return false;
  const contact = facts.emailContacts[0];
  if (!contact || contact.source !== "import") return false;
  const decision = readMembershipDecision(values);
  const locale = values.locale === "zh-HK" || values.locale === "en" ? values.locale : "en";
  const displayName = typeof values.displayName === "string" ? values.displayName : null;
  const tags = Array.isArray(values.tags) && values.tags.every((tag) => typeof tag === "string") ? values.tags : [];
  const owner = typeof values.ownerProfileId === "string" ? values.ownerProfileId : null;
  if (contact.stage !== expectedStage(decision) || contact.locale !== locale || (contact.displayName ?? null) !== displayName || (contact.ownerProfileId ?? null) !== owner || !sameList(contact.tags, tags)) return false;
  if (!membershipDecisionRequiresWrite(decision)) return contact.profileId === null && facts.emailProfiles.length === 0;
  if (!decision || facts.emailProfiles.length !== 1) return false;
  const profile = facts.emailProfiles[0];
  if (!profile || contact.profileId !== profile.id || profile.role !== "member" || profile.directoryVisible || profile.authUserId !== profile.id) return false;
  const profileName = (displayName?.trim() || email).slice(0, 200);
  const profileLocale = values.locale === "zh-HK" ? "zh-HK" : "en";
  return profile.displayName === profileName && profile.locale === profileLocale && membershipTargetMatches(profile.id, decision, facts.emailMemberships);
}
export type MatchedImportRow = Readonly<{rowNumber: number; status: "create" | "update" | "unchanged" | "duplicate" | "conflict" | "invalid"; values: Readonly<Record<string, unknown>>; targetId: string | null; expectedVersion: string | null; reason: string | null; before: Readonly<Record<string, unknown>>}>;
export function matchMemberImportRow(row: ImportValidationRow, facts: ImportMatchFacts): MatchedImportRow {
  const base = {rowNumber: row.rowNumber, values: row.values, targetId: null, expectedVersion: null, before: {}};
  const answer = (status: MatchedImportRow["status"], reason: string | null, targetId: string | null = null, expectedVersion: string | null = null, before: Readonly<Record<string, unknown>> = {}): MatchedImportRow => ({...base, status, reason, targetId, expectedVersion, before});
  if (row.status === "invalid" || row.status === "duplicate") {
    const skipped = readMembershipDecision(row.values);
    if (row.status === "invalid" && skipped?.outcome === "skipped" && skipped.reason) return answer("invalid", skipped.reason);
    return answer(row.status, row.reasons[0] ?? null);
  }
  if (row.values.ownerProfileId && !["staff", "exco", "superadmin"].includes(facts.ownerRole ?? "")) return answer("conflict", "OWNER_NOT_STAFF");
  const profileId = typeof row.values.profileId === "string" ? row.values.profileId : null;
  const email = typeof row.values.email === "string" ? row.values.email : null;
  if (!profileId) {
    if (!email) return answer("invalid", "IDENTITY_MISSING");
    if (priorImportUnchanged(row.values, facts)) return answer("unchanged", "IMPORT_ALREADY_APPLIED", null, null, {source: "import"});
    if (facts.emailProfileIds.length || facts.emailContactIds.length) return answer("conflict", "EMAIL_CANDIDATE_REVIEW");
    const created = readMembershipDecision(row.values);
    return answer("create", created?.outcome === "contact_only" ? created.reason : null);
  }
  const profile = facts.profile;
  if (!profile || profile.id !== profileId || profile.role !== "member") return answer("conflict", "PROFILE_ID_NOT_MEMBER");
  if (email && profile.email?.toLocaleLowerCase("en") !== email.toLocaleLowerCase("en")) return answer("conflict", "EMAIL_IDENTITY_CONFLICT");
  if (row.values.displayName) return answer("conflict", "NAME_REQUIRES_REVIEW");
  const changedLocale = row.values.locale !== undefined && row.values.locale !== profile.locale;
  const desiredTags = Array.isArray(row.values.tags) ? row.values.tags : null;
  const changedTags = desiredTags !== null && JSON.stringify(desiredTags) !== JSON.stringify(profile.tags);
  const changedOwner = row.values.ownerProfileId !== undefined && row.values.ownerProfileId !== profile.ownerProfileId;
  const membershipWrite = membershipDecisionRequiresWrite(readMembershipDecision(row.values));
  if (!changedLocale && !changedTags && !changedOwner && !membershipWrite) return answer("unchanged", row.values.planCode || row.values.renewalAt ? "RECOMMENDATION_ONLY" : "NO_ALLOWED_CHANGE", profileId, profile.updatedAt, {locale: profile.locale, tags: profile.tags, ownerProfileId: profile.ownerProfileId});
  return answer("update", null, profileId, profile.updatedAt, {locale: profile.locale, tags: profile.tags, ownerProfileId: profile.ownerProfileId});
}
