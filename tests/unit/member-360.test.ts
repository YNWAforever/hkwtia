import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {getMember360, type Member360Reader} from "@/lib/admin/member-360";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

const staffActor = (): AdminActor => ({kind: "staff", userId: "staff-1", profileId: "staff-1"});
const memberActor = (): Extract<Actor, {kind: "member"}> => ({kind: "member", userId: "member-1", profileId: "member-1"});

function fakeReader(overrides: Partial<Awaited<ReturnType<Member360Reader["get360"]>>> = {}): Member360Reader {
  return {
    get360: async () => ({
      profile: {id: "member-1", displayName: "Member One", email: "member@example.test", phone: null, role: "member"},
      companies: [],
      membership: null,
      engagement: {score: null, trend: null, events: []},
      emails: [],
      events: [],
      notes: [],
      journeys: [],
      whatsapp: [],
      suppressions: [],
      ...overrides,
    }),
  };
}

describe("Member 360 service", () => {
  it("returns explicit empty Member 360 sections", async () => {
    const view = await getMember360(staffActor(), "member-1", fakeReader({
      notes: [],
      emails: [],
      events: [],
      journeys: [],
      whatsapp: [],
      suppressions: [],
    }));

    expect(view).toMatchObject({
      profile: {id: "member-1"},
      notes: [],
      emails: [],
      events: [],
      journeys: [],
      whatsapp: [],
      suppressions: [],
    });
  });

  it("denies a member before the staff reader can access another profile", async () => {
    const reader: Member360Reader = {get360: async () => { throw new Error("PRIVATE_READ"); }};

    await expect(getMember360(memberActor(), "member-1", reader)).rejects.toThrow("FORBIDDEN");
  });

  it("rejects an empty profile identifier before reader access", async () => {
    const reader: Member360Reader = {get360: async () => { throw new Error("PRIVATE_READ"); }};

    await expect(getMember360(staffActor(), "", reader)).rejects.toThrow();
  });

  it("returns sanitized journey, WhatsApp, and active suppression history", async () => {
    const view = await getMember360(staffActor(), "member-1", fakeReader({
      journeys: [{
        id: "journey-1",
        journey: "renewal",
        step: "renewal_14",
        status: "failed",
        scheduledAt: "2027-01-15T09:00:00.000Z",
        attemptCount: 3,
        errorCode: "provider_client_error",
      }],
      whatsapp: [{
        id: "whatsapp-1",
        template: "renewal_14",
        status: "failed",
        locale: "zh-HK",
        classification: "transactional",
        attemptCount: 3,
        errorCode: "provider_client_error",
        createdAt: "2027-01-15T09:01:00.000Z",
      }],
      suppressions: [{
        id: "suppression-1",
        channel: "email",
        classification: "marketing",
        reasonCode: "member_unsubscribe",
        createdAt: "2027-01-14T09:00:00.000Z",
      }],
    }));

    expect(view.journeys).toHaveLength(1);
    expect(view.whatsapp).toHaveLength(1);
    expect(view.suppressions).toHaveLength(1);
    const serialized = JSON.stringify({
      journeys: view.journeys,
      whatsapp: view.whatsapp,
      suppressions: view.suppressions,
    });
    expect(serialized).not.toContain("member@example.test");
    expect(serialized).not.toContain("+85260000000");
    expect(serialized).not.toContain("providerId");
    expect(serialized).not.toContain("provider-secret");
    expect(serialized).not.toContain("idempotency");
    expect(serialized).not.toContain("message body");
    expect(serialized).not.toContain("token");
  });

  it("uses bounded newest-first target-member automation queries without provider or recipient projection", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "lib/db/repos/admin-members.ts",
    ), "utf8");

    expect(source).toContain("MEMBER_360_AUTOMATION_HISTORY_LIMIT");
    expect(source.match(/LIMIT \$\{MEMBER_360_AUTOMATION_HISTORY_LIMIT\}/g)).toHaveLength(3);
    expect(source).toMatch(/FROM \$\{journeyState\} WHERE \$\{journeyState\.profileId\} = \$\{profileId\} ORDER BY \$\{journeyState\.scheduledAt\} DESC, \$\{journeyState\.id\} DESC LIMIT \$\{MEMBER_360_AUTOMATION_HISTORY_LIMIT\}/);
    expect(source).toMatch(/FROM \$\{whatsappLog\} WHERE \$\{whatsappLog\.profileId\} = \$\{profileId\} ORDER BY \$\{whatsappLog\.createdAt\} DESC, \$\{whatsappLog\.id\} DESC LIMIT \$\{MEMBER_360_AUTOMATION_HISTORY_LIMIT\}/);
    expect(source).toMatch(/FROM \$\{messageSuppressions\} WHERE \$\{messageSuppressions\.profileId\} = \$\{profileId\} ORDER BY \$\{messageSuppressions\.createdAt\} DESC, \$\{messageSuppressions\.id\} DESC LIMIT \$\{MEMBER_360_AUTOMATION_HISTORY_LIMIT\}/);
    expect(source).not.toContain('${whatsappLog.providerId} AS "providerId"');
    expect(source).not.toContain('${whatsappLog.idempotencyKey} AS "idempotencyKey"');
  });
});
