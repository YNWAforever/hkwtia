import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";
import {z} from "zod";

import {createCampaignsRepository} from "@/lib/db/repos/campaigns";
import type {AdminActor} from "@/lib/membership/lifecycle";

const adminA: AdminActor = {kind: "staff", userId: "admin-a", profileId: "admin-a"};
const adminB: AdminActor = {kind: "staff", userId: "admin-b", profileId: "admin-b"};
const segmentA = "11111111-1111-4111-8111-111111111111";
const segmentB = "22222222-2222-4222-8222-222222222222";
const campaignA = "33333333-3333-4333-8333-333333333333";
const campaignB = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const emptyFilter = {tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null};

describe("campaign repository resource boundaries", () => {
  it("runtime-validates every public ID, filter, and input before database access", async () => {
    const privateStore = new Proxy({}, {get: () => { throw new Error("PRIVATE_DATABASE"); }});
    const repository = createCampaignsRepository(async () => { throw new Error("PRIVATE_DATABASE"); });

    await expect(repository.findCampaignByIdempotencyKey(adminA, privateStore, "bad-key", segmentA)).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.findCampaignByIdempotencyKey(adminA, privateStore, idempotencyKey, "bad-segment")).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.getSavedSegment(adminA, privateStore, "bad-segment")).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.membersForSegment(adminA, privateStore, {unknown: true} as never)).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.createCampaign(adminA, privateStore, {...queueInput(segmentA), template: ""})).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.insertRecipients(adminA, privateStore, campaignA, [{profileId: "member-1", email: "bad", locale: "en", variables: {displayName: "Member", renewalDate: null}}])).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.appendAudit(adminA, privateStore, campaignA, -1)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("prevents another admin from creating against, recovering, counting, or mutating owned campaign resources", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    const database = drizzle(async (sql, params) => {
      statements.push({sql, params});
      const normalized = sql.toLowerCase();
      if (normalized.includes('from "saved_segments"')) {
        return params.includes(adminA.profileId) && params.includes(segmentA)
          ? {rows: [[segmentA, adminA.profileId, emptyFilter]]}
          : params.includes(adminB.profileId) && params.includes(segmentB)
            ? {rows: [[segmentB, adminB.profileId, emptyFilter]]}
            : {rows: []};
      }
      if (normalized.startsWith('insert into "campaigns"')) {
        return params.includes(segmentA) && params.includes(adminB.profileId) ? {rows: [[campaignB]]} : {rows: []};
      }
      if (normalized.includes('from "campaigns"')) {
        return params.includes(adminA.profileId) && params.includes(segmentA) ? {rows: [[campaignA]]} : {rows: []};
      }
      if (normalized.includes('from "campaign_recipients"')) return {rows: [[1]]};
      return {rows: []};
    });
    const repository = createCampaignsRepository(async () => database as never);

    await expect(repository.findCampaignByIdempotencyKey(adminA, database, idempotencyKey, segmentA)).resolves.toEqual({campaignId: campaignA, recipientCount: 1});
    await expect(repository.findCampaignByIdempotencyKey(adminB, database, idempotencyKey, segmentA)).resolves.toBeNull();

    statements.length = 0;
    await expect(repository.createCampaign(adminB, database, queueInput(segmentA))).rejects.toThrow();
    expect(statements.some(({sql}) => sql.toLowerCase().startsWith('insert into "campaigns"'))).toBe(false);

    statements.length = 0;
    await expect(repository.createCampaign(adminB, database, queueInput(segmentB))).rejects.toThrow("Campaign idempotency claim was not visible");
    expect(statements.some(({sql}) => sql.toLowerCase().includes('insert into "campaign_recipients"'))).toBe(false);

    statements.length = 0;
    await expect(repository.insertRecipients(adminB, database, campaignA, [{profileId: "member-1", email: "member@example.test", locale: "en", variables: {displayName: "Member", renewalDate: null}}])).rejects.toThrow();
    expect(statements.some(({sql}) => sql.toLowerCase().startsWith('insert into "campaign_recipients"'))).toBe(false);

    statements.length = 0;
    await expect(repository.appendAudit(adminB, database, campaignA, 1)).rejects.toThrow();
    expect(statements.some(({sql}) => sql.toLowerCase().startsWith('insert into "audit_events"'))).toBe(false);
  });
});

function queueInput(segmentId: string) {
  return {segmentId, template: "renewal-reminder", localeStrategy: "profile" as const, idempotencyKey};
}
