import {describe, expect, it} from "vitest";

import {matchMemberImportRow, type ImportMatchFacts} from "@/lib/admin/imports/match";

const blank: ImportMatchFacts = {profile: null, emailProfileIds: [], emailContactIds: [], ownerRole: null};
const row = (values: Record<string, unknown>) => ({rowNumber: 2, status: "update_candidate" as const, reasons: [], values});

describe("member import identity and change matching", () => {
  it("updates only an exact member ID and treats an email disagreement as conflict", () => {
    const facts: ImportMatchFacts = {...blank, profile: {id: "p-1", role: "member", email: "owner@example.test", locale: "en", updatedAt: "2026-09-27 00:00:00.123456+00", tags: [], ownerProfileId: null}};
    expect(matchMemberImportRow(row({profileId: "p-1", locale: "zh-HK"}), facts)).toMatchObject({status: "update", targetId: "p-1", expectedVersion: facts.profile?.updatedAt, before: {locale: "en", tags: [], ownerProfileId: null}});
    expect(matchMemberImportRow(row({profileId: "p-1", email: "someone@example.test"}), facts)).toMatchObject({status: "conflict", reason: "EMAIL_IDENTITY_CONFLICT"});
    expect(matchMemberImportRow(row({profileId: "p-1", locale: "en"}), facts)).toMatchObject({status: "unchanged"});
  });

  it("creates only a CRM contact when no identity exists; an email candidate stays manual", () => {
    expect(matchMemberImportRow({...row({email: "new@example.test", displayName: "New"}), status: "new_contact_candidate"}, blank)).toMatchObject({status: "create", targetId: null});
    expect(matchMemberImportRow({...row({email: "owner@example.test"}), status: "new_contact_candidate"}, {...blank, emailProfileIds: ["p-1"]})).toMatchObject({status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW"});
    expect(matchMemberImportRow({...row({email: "contact@example.test"}), status: "new_contact_candidate"}, {...blank, emailContactIds: ["c-1"]})).toMatchObject({status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW"});
  });

  it("treats a matching import shell as unchanged and a pre-existing profile as a conflict", () => {
    const decision = {outcome: "would_create_membership" as const, reason: null, planCode: "individual" as const, membershipStatus: "active" as const, billingPeriodStart: "2026-05-01", billingPeriodEnd: "2027-04-30"};
    const values = {email: "ada@example.test", displayName: "Ada", tier: "individual", membershipStatus: "active", membershipDecision: decision};
    const shell = {id: "shell-1", role: "member", displayName: "Ada", locale: "en", directoryVisible: false, authUserId: "shell-1"};
    const contact = {id: "contact-1", source: "import", profileId: "shell-1", displayName: "Ada", locale: "en", stage: "member", ownerProfileId: null, tags: [] as const};
    const membership = {ownerUserId: "shell-1", planCode: "individual", status: "active", billingPeriodStart: "2026-05-01", billingPeriodEnd: "2027-04-30"};
    const facts = {...blank, emailProfileIds: ["shell-1"], emailContactIds: ["contact-1"], emailProfiles: [shell], emailContacts: [contact], emailMemberships: [membership]};
    expect(matchMemberImportRow({...row(values), status: "new_contact_candidate"}, facts)).toMatchObject({status: "unchanged", reason: "IMPORT_ALREADY_APPLIED"});
    expect(matchMemberImportRow({...row({...values, displayName: "Ada Edited"}), status: "new_contact_candidate"}, facts)).toMatchObject({status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW"});
    expect(matchMemberImportRow({...row(values), status: "new_contact_candidate"}, {...facts, emailProfiles: [{...shell, authUserId: "neon-user"}], emailProfileIds: ["shell-1"]})).toMatchObject({status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW"});
    expect(matchMemberImportRow({...row({email: "held@example.test"}), status: "new_contact_candidate"}, {...blank, emailProfileIds: ["member-1"], emailProfiles: [{id: "member-1", role: "member", displayName: "Held", locale: "en", directoryVisible: false, authUserId: null}], emailContacts: [], emailMemberships: []})).toMatchObject({status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW"});
    const contactOnly = {email: "eve@example.test", displayName: "Eve", membershipDecision: {outcome: "contact_only" as const, reason: "FORMER", planCode: null, membershipStatus: null, billingPeriodStart: null, billingPeriodEnd: null}};
    expect(matchMemberImportRow({...row(contactOnly), status: "new_contact_candidate"}, {...blank, emailContactIds: ["c-eve"], emailContacts: [{id: "c-eve", source: "import", profileId: null, displayName: "Eve", locale: "en", stage: "new", ownerProfileId: null, tags: []}], emailProfiles: [], emailMemberships: []})).toMatchObject({status: "unchanged", reason: "IMPORT_ALREADY_APPLIED"});
    expect(matchMemberImportRow({...row(contactOnly), status: "new_contact_candidate"}, {...blank, emailContactIds: ["c-eve"], emailContacts: [{id: "c-eve", source: "event_guest", profileId: null, displayName: "Eve", locale: "en", stage: "new", ownerProfileId: null, tags: []}], emailProfiles: [], emailMemberships: []})).toMatchObject({status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW"});
  });

  it("requires a real staff owner and preserves invalid or duplicate rows", () => {
    expect(matchMemberImportRow(row({profileId: "p-1", ownerProfileId: "unknown"}), blank)).toMatchObject({status: "conflict", reason: "OWNER_NOT_STAFF"});
    expect(matchMemberImportRow({...row({email: "x@example.test"}), status: "duplicate", reasons: ["DUPLICATE_EMAIL"]}, blank)).toMatchObject({status: "duplicate"});
  });
});
