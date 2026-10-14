import {describe, expect, it, vi} from "vitest";
import type {Event} from "@/lib/db/server-schema";
import {getPortalEvent} from "@/lib/portal/member-event";

const actor = {kind: "member", userId: "auth", profileId: "profile"} as const;
const event: Event = {id: "event", slug: "private", titleEn: "Private", titleZh: "會員活動", descriptionEn: "Details", descriptionZh: "活動詳情", startsAt: new Date("2099-01-01"), endsAt: null, venue: "WTIA", capacity: 20,
  memberOnly: true, published: true, heroMediaId: null, createdAt: new Date("2026-10-14"), updatedAt: new Date("2026-10-14"), organiserCompanyId: null, submittedByProfileId: null, submittedAt: null, status: "published", visibility: "members_only", format: "in_person", onlineUrl: null, registrationMode: "ticketed", externalRegistrationUrl: null, ticketPriceHkdCents: 25000, tags: [], publishedAt: null, reviewedAt: null, reviewedByProfileId: null, rejectionReason: null};
describe("protected member event details", () => {
  it.each(["pending_payment", "pending_review", "expired", "cancelled"] as const)("does not read event details for %s", async (status) => {
    const readEvent = vi.fn(async () => event);
    await expect(getPortalEvent(actor, "event", "en", {listMemberships: async () => [{status, companyId: null}], readEvent})).rejects.toThrow("MEMBERSHIP_INACTIVE");
    expect(readEvent).not.toHaveBeenCalled();
  });
  it.each(["active", "past_due", "cancel_at_period_end"] as const)("preserves existing %s access and localized content", async (status) => {
    const result = await getPortalEvent(actor, "event", "zh-HK", {listMemberships: async () => [{status, companyId: null}], readEvent: async () => event});
    expect(result).toMatchObject({id: "event", title: "會員活動", ticketPriceHkdCents: 25000});
    expect(result).not.toHaveProperty("reviewedByProfileId");
  });
  it.each([{...event, visibility: "invite_only" as const}, {...event, status: "draft" as const}, {...event, published: false}])("fails closed for unavailable event rows", async (row) => {
    await expect(getPortalEvent(actor, "event", "en", {listMemberships: async () => [{status: "active", companyId: null}], readEvent: async () => row})).resolves.toBeNull();
  });
});
