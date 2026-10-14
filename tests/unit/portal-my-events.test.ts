import {describe, expect, it, vi} from "vitest";
import {getMyRegistrations} from "@/lib/portal/my-events";
const actor = {kind: "member", userId: "auth", profileId: "buyer"} as const;
const row = {id: "22222222-2222-4222-8222-222222222222", eventId: "11111111-1111-4111-8111-111111111111", source: "ticket" as const, status: "pending" as const,
  titleEn: "Event", titleZh: "活動", startsAt: "2099-01-01T00:00:00.000000Z", eventStatus: "published", visibility: "members_only"};
describe("own registrations and buyer order history", () => {
  it.each(["pending", "paid", "expired", "failed", "refunded", "refund_pending", "refund_failed"] as const)("maps stored %s to own-order recovery without inferring a valid attendee pass", async (status) => {
    const read = vi.fn(async () => ({items: [{...row, status, buyerEmail: "private@example.test", stripeCheckoutUrl: "secret"}], nextCursor: null, cursorReset: false}));
    const result = await getMyRegistrations(actor, {}, "zh-HK", read);
    expect(read).toHaveBeenCalledWith(actor, {});
    expect(result.items[0]).toEqual({id: row.id, eventId: row.eventId, source: "ticket", status, title: "活動", startsAt: row.startsAt,
      eventCancelled: false, href: `/zh/portal/orders/${row.id}`});
  });
  it("shows stored RSVP state and keeps ordering/cursor from the scoped reader", async () => {
    const read = vi.fn(async () => ({items: [{...row, source: "rsvp" as const, status: "waitlist" as const}], nextCursor: "next", cursorReset: false}));
    const result = await getMyRegistrations(actor, {limit: 20, cursor: "prior"}, "en", read);
    expect(result.items[0]).toMatchObject({source: "rsvp", status: "waitlist", href: `/portal/events/${row.eventId}`});
    expect(result.nextCursor).toBe("next");
  });
  it("keeps minimal history for withdrawn/cancelled events without a detail link", async () => {
    const read = async () => ({items: [{...row, source: "rsvp" as const, status: "registered" as const, eventStatus: "cancelled"}], nextCursor: null, cursorReset: false});
    expect((await getMyRegistrations(actor, {}, "en", read)).items[0]).toMatchObject({eventCancelled: true, href: null});
  });
  it("rejects anonymous and staff before reading; propagates failed reads", async () => {
    const read = vi.fn(async () => {throw new Error("DATABASE_UNAVAILABLE");});
    for (const forbidden of [{kind: "anonymous", userId: null}, {kind: "staff", userId: "staff", profileId: "staff"}] as const) {
      await expect(getMyRegistrations(forbidden, {}, "en", read)).rejects.toThrow("FORBIDDEN");
    }
    expect(read).not.toHaveBeenCalled();
    await expect(getMyRegistrations(actor, {}, "en", read)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
