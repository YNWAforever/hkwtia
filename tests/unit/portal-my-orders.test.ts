import {describe, expect, it, vi} from "vitest";
import {getMyOrder} from "@/lib/portal/my-orders";

const actor = {kind: "member", userId: "auth", profileId: "profile"} as const;
const order = {id: "order", buyerProfileId: "profile", eventId: "event", titleEn: "Private event", titleZh: "會員活動", startsAt: new Date("2099-01-01"), status: "pending" as const, amountHkdCents: 25000, currency: "hkd", paidAt: null, refundedAt: null};
describe("own order projection", () => {
  it("reads with the actor's profile ID and does not consult paid membership", async () => {
    const read = vi.fn(async () => ({...order, stripeCheckoutSessionId: "secret-session", buyerEmail: "other@example.test"}));
    const result = await getMyOrder(actor, "order", read);
    expect(read).toHaveBeenCalledWith(actor, "order");
    expect(result).toMatchObject({id: "order", status: "pending", paidAt: null});
    expect(result).not.toHaveProperty("buyerProfileId");
    expect(result).not.toHaveProperty("stripeCheckoutSessionId");
    expect(result).not.toHaveProperty("buyerEmail");
  });
  it("refuses another buyer even if an adapter returns an incorrectly scoped row", async () => {
    await expect(getMyOrder(actor, "order", async () => ({...order, buyerProfileId: "other"}))).resolves.toBeNull();
  });
  it("refuses a non-member before any read and propagates unavailable data", async () => {
    const read = vi.fn();
    await expect(getMyOrder({kind: "anonymous", userId: null}, "order", read)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    await expect(getMyOrder(actor, "order", async () => {throw new Error("DATABASE_UNAVAILABLE");})).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
