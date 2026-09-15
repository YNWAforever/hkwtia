import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

import {loadPassPage} from "@/lib/tickets/pass-page";

const claims = {seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d"};

// The loader re-signs the verified claims into the staff check-in URL, so it
// reads the pass secret and APP_URL. Neither is present in a bare test
// environment, and signPassToken refuses an empty secret by design.
beforeAll(() => {
  vi.stubEnv("TICKET_PASS_TOKEN_SECRET", "test-pass-secret-not-a-real-key");
  vi.stubEnv("APP_URL", "https://pass.example.test");
});
afterAll(() => { vi.unstubAllEnvs(); });

describe("the public pass page", () => {
  it("returns the pass for a valid token over a paid seat", async () => {
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: null, eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: "Cyberport", buyerLocale: "en"}),
    });
    expect(result).toMatchObject({attendeeName: "Ada", eventTitle: "Edge AI"});
    // The QR must publish the staff check-in surface, never the pass URL.
    expect(result?.checkInUrl).toContain("/admin/check-in/");
    expect(result?.checkInUrl).not.toContain("/pass/");
    expect(result?.qr).toContain("<svg");
  });

  it("returns null for an invalid token, and for a seat whose order is not paid", async () => {
    expect(await loadPassPage("bad", {verify: () => null, passForSeat: async () => null})).toBeNull();
    expect(await loadPassPage("tok", {verify: () => ({...claims, v: 1}), passForSeat: async () => null})).toBeNull();
  });

  it("uses the Chinese title for a zh-HK pass", async () => {
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: "邊緣 AI", eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: null, buyerLocale: "zh-HK"}),
    });
    expect(result?.eventTitle).toBe("邊緣 AI");
  });
});
