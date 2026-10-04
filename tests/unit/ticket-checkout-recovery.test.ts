import {describe, expect, it, vi} from "vitest";

import {readTicketRecovery, recoveryDigest, resumeTicketRecovery} from "@/lib/tickets/checkout-recovery";

const TOKEN = "a".repeat(43);
const ORDER = {
  orderId: "order-1", eventId: "event-1", buyerProfileId: "profile-1",
  status: "pending" as const, seatCount: 3, amountHkdCents: 75000,
  expiresAt: new Date("2026-10-01T12:00:00Z"), recoveryExpiresAt: new Date("2026-10-01T13:00:00Z"),
  stripeCheckoutSessionId: "cs_test_1", stripeCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
};
const NOW = new Date("2026-10-01T11:00:00Z");
const actor = {kind: "member" as const, userId: "user-1", profileId: "profile-1"};
function deps(row: typeof ORDER | null = ORDER) {
  return {
    store: {read: vi.fn().mockResolvedValue(row), invalidate: vi.fn().mockResolvedValue(undefined)},
    stripe: {ticketSessionStatus: vi.fn().mockResolvedValue("open")},
    orders: {expireBySession: vi.fn().mockResolvedValue(true), expireUnattachedOrder: vi.fn().mockResolvedValue(true)},
    now: () => NOW,
  };
}

describe("ticket checkout recovery capability", () => {
  it("uses a digest without retaining the raw token", () => {
    expect(recoveryDigest(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
    expect(recoveryDigest(TOKEN)).not.toContain(TOKEN);
  });
  it("returns only a pending summary for the matching member and event", async () => {
    const services = deps();
    const summary = await readTicketRecovery({token: TOKEN, eventId: "event-1", actor}, services);
    expect(summary).toEqual({eventId: "event-1", status: "pending", seatCount: 3, amountHkdCents: 75000, expiresAt: ORDER.expiresAt.toISOString()});
    expect(JSON.stringify(summary)).not.toContain("stripe");
    expect(services.store.read).toHaveBeenCalledWith(recoveryDigest(TOKEN), NOW);
  });
  it("conceals unknown, wrong-event, wrong-owner and expired capabilities", async () => {
    expect(await readTicketRecovery({token: TOKEN, eventId: "event-1", actor}, deps(null))).toBeNull();
    expect(await readTicketRecovery({token: TOKEN, eventId: "event-2", actor}, deps())).toBeNull();
    expect(await readTicketRecovery({token: TOKEN, eventId: "event-1", actor: {...actor, profileId: "other"}}, deps())).toBeNull();
    expect(await readTicketRecovery({token: TOKEN, eventId: "event-1", actor: {kind: "anonymous", userId: null}}, deps())).toBeNull();
    expect(await readTicketRecovery({token: TOKEN, eventId: "event-1", actor}, deps({...ORDER, recoveryExpiresAt: NOW}))).toBeNull();
  });
  it("resumes the existing open session and never creates another", async () => {
    const services = deps();
    expect(await resumeTicketRecovery({token: TOKEN, eventId: "event-1", actor}, services)).toEqual({status: "redirect", url: ORDER.stripeCheckoutUrl});
    expect(services.stripe.ticketSessionStatus).toHaveBeenCalledWith("cs_test_1");
    expect(services.orders.expireBySession).not.toHaveBeenCalled();
  });
  it("requires provider-confirmed expiry before releasing the old attempt", async () => {
    const services = deps();
    services.stripe.ticketSessionStatus.mockResolvedValue("expired");
    expect(await resumeTicketRecovery({token: TOKEN, eventId: "event-1", actor}, services)).toEqual({status: "error", code: "RETRY_EXPIRED"});
    expect(services.orders.expireBySession).toHaveBeenCalledWith("cs_test_1", ORDER.orderId);
    expect(services.store.invalidate).toHaveBeenCalledWith(recoveryDigest(TOKEN));
  });
  it("retains an uncertain provider attempt and denies a different owner", async () => {
    const services = deps();
    services.stripe.ticketSessionStatus.mockRejectedValue(new Error("provider down"));
    expect(await resumeTicketRecovery({token: TOKEN, eventId: "event-1", actor}, services)).toEqual({status: "error", code: "UNAVAILABLE"});
    expect(services.orders.expireBySession).not.toHaveBeenCalled();
    expect(await resumeTicketRecovery({token: TOKEN, eventId: "event-1", actor: {...actor, profileId: "other"}}, services)).toEqual({status: "error", code: "NOT_FOUND"});
  });
});
