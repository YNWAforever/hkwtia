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

  it("requires a real staff owner and preserves invalid or duplicate rows", () => {
    expect(matchMemberImportRow(row({profileId: "p-1", ownerProfileId: "unknown"}), blank)).toMatchObject({status: "conflict", reason: "OWNER_NOT_STAFF"});
    expect(matchMemberImportRow({...row({email: "x@example.test"}), status: "duplicate", reasons: ["DUPLICATE_EMAIL"]}, blank)).toMatchObject({status: "duplicate"});
  });
});
