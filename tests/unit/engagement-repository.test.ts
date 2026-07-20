import {describe, expect, it, vi} from "vitest";
import {appendEngagementEvent, getEngagementTimeline, type EngagementEventExecutor, type EngagementTimelineReader} from "@/lib/db/repos/engagement";
import type {Actor} from "@/lib/membership/lifecycle";

const staff = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
const member = {kind: "member", userId: "auth-member", profileId: "member-1"} as const;
const renewalMetadata = {
  membershipId: "11111111-1111-4111-8111-111111111111",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2027-07-01T00:00:00.000Z",
  renewalOrdinal: 1,
} as const;

describe("engagement repository operations", () => {
  it.each<Actor>([staff, system])("allows $kind to append an audited fact through an injected transaction executor", async (actor) => {
    const insertEvent = vi.fn(async (input) => ({id: "event-1", ...input}));
    const insertAudit = vi.fn(async () => undefined);
    const executor: EngagementEventExecutor = {transaction: (work) => work({insertEvent, insertAudit})};
    await expect(appendEngagementEvent(actor, {profileId: "member-1", companyId: null, type: "renewal_paid", points: 10, metadata: renewalMetadata, occurredAt: new Date("2026-07-19T00:00:00.000Z")}, executor)).resolves.toMatchObject({id: "event-1", type: "renewal_paid", points: 10});
    expect(insertEvent).toHaveBeenCalledOnce();
    expect(insertAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: actor.kind === "system" ? null : staff.profileId,
      action: "engagement_event.appended", targetId: "member-1",
    }));
  });

  it("rejects non-admin actors, forged system actors, unknown event types, and non-integer points before writing", async () => {
    const insertEvent = vi.fn();
    const insertAudit = vi.fn();
    const executor: EngagementEventExecutor = {transaction: (work) => work({insertEvent, insertAudit})};
    const valid = {profileId: "member-1", type: "renewal_failed", points: -5, metadata: {}};
    await expect(appendEngagementEvent(member, valid, executor)).rejects.toThrow("FORBIDDEN");
    await expect(appendEngagementEvent({kind: "system", userId: null, source: "scheduler"} as unknown as Actor, valid, executor)).rejects.toThrow("FORBIDDEN");
    await expect(appendEngagementEvent(staff, {...valid, type: "stripe.secret"}, executor)).rejects.toThrow();
    await expect(appendEngagementEvent(staff, {...valid, points: 1.5}, executor)).rejects.toThrow();
    expect(insertEvent).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["missing renewal metadata", {}],
    ["invalid membership id", {...renewalMetadata, membershipId: "membership-1"}],
    ["missing period start", {membershipId: renewalMetadata.membershipId, periodEnd: renewalMetadata.periodEnd, renewalOrdinal: 1}],
    ["invalid period start", {...renewalMetadata, periodStart: "not-a-date"}],
    ["missing period end", {membershipId: renewalMetadata.membershipId, periodStart: renewalMetadata.periodStart, renewalOrdinal: 1}],
    ["reversed periods", {...renewalMetadata, periodEnd: "2026-06-30T23:59:59.999Z"}],
    ["equal periods", {...renewalMetadata, periodEnd: renewalMetadata.periodStart}],
    ["zero ordinal", {...renewalMetadata, renewalOrdinal: 0}],
    ["fractional ordinal", {...renewalMetadata, renewalOrdinal: 1.5}],
  ])("rejects %s for renewal facts before writing", async (_case, metadata) => {
    const insertEvent = vi.fn();
    const executor: EngagementEventExecutor = {transaction: (work) => work({insertEvent, insertAudit: vi.fn()})};
    await expect(appendEngagementEvent(staff, {profileId: "member-1", type: "renewal_failed", points: -10, metadata}, executor)).rejects.toThrow();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("bounds JSON metadata for non-renewal facts and forbids renewal metadata masquerading", async () => {
    const insertEvent = vi.fn();
    const executor: EngagementEventExecutor = {transaction: (work) => work({insertEvent, insertAudit: vi.fn()})};
    await expect(appendEngagementEvent(staff, {profileId: "member-1", type: "event_attended", points: 5, metadata: renewalMetadata}, executor)).rejects.toThrow();
    await expect(appendEngagementEvent(staff, {profileId: "member-1", type: "event_attended", points: 5, metadata: {note: "x".repeat(8_193)}}, executor)).rejects.toThrow();
    await expect(appendEngagementEvent(staff, {profileId: "member-1", type: "event_attended", points: 5, metadata: {unsafe: () => "not-json"}}, executor)).rejects.toThrow();
    expect(insertEvent).not.toHaveBeenCalled();
  });
  it("rolls back the engagement mutation when its audit insert fails", async () => {
    let committed = false;
    const executor: EngagementEventExecutor = {transaction: async (work) => {
      const result = await work({
        insertEvent: async (input) => ({id: "event-1", ...input, occurredAt: input.occurredAt ?? new Date("2026-07-19T00:00:00.000Z")}),
        insertAudit: async () => { throw new Error("AUDIT_FAILED"); },
      });
      committed = true;
      return result;
    }};
    await expect(appendEngagementEvent(staff, {profileId: "member-1", type: "event_attended", points: 5}, executor)).rejects.toThrow("AUDIT_FAILED");
    expect(committed).toBe(false);
  });

  it("reads a staff-only timeline in deterministic newest-first order", async () => {
    const reader: EngagementTimelineReader = {listForProfile: vi.fn(async () => [
      {id: "older", profileId: "member-1", companyId: null, type: "event_attended", points: 5, metadata: {}, occurredAt: new Date("2026-07-18T12:00:00.000Z")},
      {id: "newer-b", profileId: "member-1", companyId: null, type: "renewal_paid", points: 10, metadata: {}, occurredAt: new Date("2026-07-19T12:00:00.000Z")},
      {id: "newer-a", profileId: "member-1", companyId: null, type: "renewal_failed", points: -5, metadata: {}, occurredAt: new Date("2026-07-19T12:00:00.000Z")},
    ])};
    await expect(getEngagementTimeline(staff, "member-1", reader)).resolves.toMatchObject([{id: "newer-b"}, {id: "newer-a"}, {id: "older"}]);
    await expect(getEngagementTimeline(member, "member-1", reader)).rejects.toThrow("FORBIDDEN");
  });
});
