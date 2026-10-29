import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import {matchMemberImportRow, type ImportMatchFacts} from "@/lib/admin/imports/match";
import {decideMembershipImport, isLegacyMemberKey, normaliseImportTier, tallyImportRows} from "@/lib/admin/imports/membership-decision";
import {membershipImportWriteMode} from "@/lib/admin/imports/membership-write-guard";
import {parseMemberImport} from "@/lib/admin/imports/parse";
import {validateMemberImportRows} from "@/lib/admin/imports/validate";

const bytes = (value: string) => new TextEncoder().encode(value);
const blank: ImportMatchFacts = {profile: null, emailProfileIds: [], emailContactIds: [], ownerRole: null};
const mapping = {email: "Email", displayName: "Name", tier: "Tier", membershipStatus: "Status", expiryAt: "Expiry", renewAt: "Renew", joinedAt: "Join", legacyMemberId: "Legacy"};

const sample = `Email,Name,Tier,Status,Expiry,Renew,Join,Legacy
ada.active@example.test,Ada,Individual,active,2027-04-30,2027-04-30,2026-05-01,IN10001
bea.active@example.test,Bea,CORPORATE,active,2027-04-30,2027-04-30,,
cy.active@example.test,Cy, platinum ,active,2027-09-30,2027-09-30,,
dee.lapsed@example.test,Dee,Corporate,lapsed,2024-04-30,2024-04-30,,
eve.former@example.test,Eve,Individual,former,,,,
finn.noauth@example.test,Finn,Platinum,no_auth,,,,
gia.associate@example.test,Gia,Associate,active,2027-04-30,,,
hal.bad@example.test,Hal,Gold,active,2027-04-30,,,
`;

describe("member import membership decisions", () => {
  it("normalises tier labels and never treats an IN key as a plan code", () => {
    expect(normaliseImportTier("Individual")).toEqual({kind: "plan", planCode: "individual"});
    expect(normaliseImportTier(" Corporate ")).toEqual({kind: "plan", planCode: "corporate"});
    expect(normaliseImportTier("PLATINUM")).toEqual({kind: "plan", planCode: "platinum"});
    expect(normaliseImportTier("Associate")).toEqual({kind: "associate"});
    expect(normaliseImportTier("Gold")).toEqual({kind: "unknown"});
    expect(isLegacyMemberKey("IN10001")).toBe(true);
    expect(isLegacyMemberKey("in10001")).toBe(true);
    expect(isLegacyMemberKey("ada.active@example.test")).toBe(false);
  });

  it("keeps a capitalised tier out of planCode until it is normalised", async () => {
    const parsed = await parseMemberImport(bytes("Email,Plan\nada.active@example.test,Individual\n"), "csv");
    const [row] = validateMemberImportRows(parsed, {email: "Email", planCode: "Plan"});
    expect(row?.values.planCode).toBe("individual");
    expect(row?.values).not.toHaveProperty("membershipDecision");
    expect(row?.status).toBe("new_contact_candidate");
  });

  it("reports would-create, expired, contact-only and skipped without using legacy member ids", async () => {
    const parsed = await parseMemberImport(bytes(sample), "csv");
    const validated = validateMemberImportRows(parsed, mapping, {membershipWrites: true});
    const matched = validated.map((row) => matchMemberImportRow(row, blank));
    expect(tallyImportRows(matched)).toMatchObject({
      total: 8,
      create: 6,
      invalid: 0,
      conflict: 0,
      wouldCreateMembership: 3,
      wouldSetExpired: 1,
      contactOnly: 2,
      skipped: 2,
    });
    const ada = matched[0];
    expect(ada?.values.tier).toBe("individual");
    expect(ada?.values.planCode).toBeUndefined();
    expect(ada?.values.legacyMemberId).toBe("IN10001");
    expect(ada?.values.profileId).toBeUndefined();
    expect(ada?.values.membershipDecision).toMatchObject({outcome: "would_create_membership", planCode: "individual", membershipStatus: "active", billingPeriodStart: "2026-05-01", billingPeriodEnd: "2027-04-30"});
    expect(matched[3]?.values.membershipDecision).toMatchObject({outcome: "would_set_expired", planCode: "corporate", membershipStatus: "expired"});
    expect(matched[4]).toMatchObject({status: "create", reason: "FORMER"});
    expect(matched[5]).toMatchObject({status: "create", reason: "NO_AUTH"});
    expect(matched[6]).toMatchObject({status: "invalid", reason: "ASSOCIATE_SKIPPED"});
    expect(matched[7]).toMatchObject({status: "invalid", reason: "TIER_UNSUPPORTED"});
    expect(decideMembershipImport({tier: "individual"})).toMatchObject({outcome: "contact_only", reason: "STATUS_ABSENT"});
  });

  it("rejects an IN member number mapped as the trusted profile id", async () => {
    const parsed = await parseMemberImport(bytes("Email,Member ID,Tier,Status\nivy.legacy@example.test,IN10002,Individual,active\n"), "csv");
    const [row] = validateMemberImportRows(parsed, {email: "Email", profileId: "Member ID", tier: "Tier", membershipStatus: "Status"}, {membershipWrites: true});
    expect(row?.status).toBe("invalid");
    expect(row?.reasons).toContain("LEGACY_MEMBER_ID_NOT_PROFILE");
    const matched = matchMemberImportRow(row!, {...blank, profile: {id: "IN10002", role: "member", email: "ivy.legacy@example.test", locale: "en", updatedAt: "2026-01-01", tags: [], ownerProfileId: null}});
    expect(matched.status).toBe("invalid");
    expect(matched.targetId).toBeNull();
  });

  it("turns an otherwise unchanged member into an update when a membership write is staged", () => {
    const facts: ImportMatchFacts = {...blank, profile: {id: "profile-b", role: "member", email: "b@example.test", locale: "en", updatedAt: "2026-09-27 00:00:00+00", tags: [], ownerProfileId: null}};
    const decision = decideMembershipImport({tier: "corporate", membershipStatus: "expired", expiryAt: "2024-01-01"});
    const withWrite = matchMemberImportRow({rowNumber: 2, status: "update_candidate", reasons: [], values: {profileId: "profile-b", email: "b@example.test", tier: "corporate", membershipStatus: "expired", membershipDecision: decision}}, facts);
    expect(withWrite).toMatchObject({status: "update", targetId: "profile-b"});
    const recommendation = matchMemberImportRow({rowNumber: 2, status: "update_candidate", reasons: [], values: {profileId: "profile-b", email: "b@example.test", planCode: "corporate", renewalAt: "2027-04-30"}}, facts);
    expect(recommendation).toMatchObject({status: "unchanged", reason: "RECOMMENDATION_ONLY"});
  });

  it("fails closed unless both flags are on and the process is not production", () => {
    const enabled = {MEMBER_IMPORT_ENABLED: "true", MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED: "true"};
    expect(membershipImportWriteMode({...enabled, NODE_ENV: "test"})).toBe("on");
    expect(membershipImportWriteMode({...enabled, NODE_ENV: "development"})).toBe("on");
    expect(membershipImportWriteMode({...enabled, NODE_ENV: "production", VERCEL_ENV: "preview"})).toBe("on");
    expect(membershipImportWriteMode({...enabled, NODE_ENV: "production", VERCEL_ENV: "development"})).toBe("on");
    expect(membershipImportWriteMode({...enabled, NODE_ENV: "production", VERCEL_ENV: "production"})).toBe("production_forbidden");
    expect(membershipImportWriteMode({...enabled, VERCEL_ENV: "production"})).toBe("production_forbidden");
    expect(membershipImportWriteMode({...enabled, NODE_ENV: "production"})).toBe("production_forbidden");
    expect(membershipImportWriteMode({MEMBER_IMPORT_ENABLED: "true", MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED: "false", VERCEL_ENV: "preview"})).toBe("off");
    expect(membershipImportWriteMode({MEMBER_IMPORT_ENABLED: "false", MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED: "true", NODE_ENV: "test"})).toBe("off");
    expect(membershipImportWriteMode({})).toBe("off");
  });

  it("does not import a mailer or Stripe from the membership write path", () => {
    const sources = ["lib/db/repos/batch-handlers/import-commit.ts", "lib/db/repos/batch-handlers/import-membership-write.ts", "lib/admin/imports/membership-decision.ts"];
    const imports = sources.flatMap((path) => readFileSync(path, "utf8").split("\n").filter((line) => line.trimStart().startsWith("import ")));
    expect(imports.join("\n")).not.toMatch(/stripe|resend|sendEmail|@\/lib\/billing|@\/lib\/email/i);
  });
});
