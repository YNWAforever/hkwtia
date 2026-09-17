import {renderToStaticMarkup} from "react-dom/server";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn((): never => { throw new Error("NEXT_NOT_FOUND_SENTINEL"); }),
}));

// The page module is the only caller that reaches `loadPassPage(token)` with no
// injected dependencies, and those defaults read the pass secret and the
// database. Wrapping the real loader (rather than replacing it) lets the
// page's not-found path be driven without either, while the loader cases below
// still exercise the real implementation.
vi.mock("@/lib/tickets/pass-page", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tickets/pass-page")>();
  return {...actual, loadPassPage: vi.fn(actual.loadPassPage)};
});
vi.mock("next/navigation", () => navigation);
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import PassPage from "@/app/[locale]/(public)/pass/[token]/page";
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
  it("claims the QR encodes the staff check-in url, never the pass url", async () => {
    const qr = vi.fn(async (text: string) => `<svg data-length="${text.length}"></svg>`);
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({status: "active", view: {seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: null, eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: "Cyberport", buyerLocale: "en"}}),
      qr,
    });
    expect(result).toMatchObject({state: "active", attendeeName: "Ada", eventTitle: "Edge AI"});
    if (result?.state !== "active") throw new Error("expected an active pass result");
    expect(result.checkInUrl).toContain("/admin/check-in/");
    expect(result.checkInUrl).not.toContain("/pass/");
    expect(result.qr).toContain("<svg");

    // The end-to-end invariant: what the encoder is actually handed is the
    // staff surface. Asserting on `checkInUrl` alone would pass just as happily
    // if the QR were built from the pass url or a constant.
    expect(qr).toHaveBeenCalledOnce();
    const encoded = qr.mock.calls[0][0];
    expect(encoded).toContain("/admin/check-in/");
    expect(encoded).not.toContain("/pass/");

    // A misconfigured APP_URL must surface as a caught failure, not as a QR
    // that scans to nowhere.
    const url = new URL(encoded);
    expect(["http:", "https:"]).toContain(url.protocol);
    expect(url.origin).not.toBe("");
  });

  it("returns null for an invalid token, and for an unavailable seat", async () => {
    expect(await loadPassPage("bad", {verify: () => null, passForSeat: async () => ({status: "unavailable"})})).toBeNull();
    expect(await loadPassPage("tok", {verify: () => ({...claims, v: 1}), passForSeat: async () => ({status: "unavailable"})})).toBeNull();
  });

  it("uses the Chinese title for a zh-HK pass", async () => {
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({status: "active", view: {seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: "邊緣 AI", eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: null, buyerLocale: "zh-HK"}}),
    });
    if (result?.state !== "active") throw new Error("expected an active pass result");
    expect(result.eventTitle).toBe("邊緣 AI");
  });

  it("returns a cancelled state, with no check-in url or QR, when the event was cancelled", async () => {
    const qr = vi.fn(async () => "<svg></svg>");
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({status: "cancelled", view: {seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: "邊緣 AI", eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: "Cyberport", buyerLocale: "en"}}),
      qr,
    });
    // The cancelled state is not the active pass minus a QR: it is its own
    // shape, so a cancelled pass cannot accidentally carry a check-in URL.
    expect(result).toEqual({
      state: "cancelled", attendeeName: "Ada", eventTitle: "Edge AI",
      eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: "Cyberport",
    });
    expect(qr).not.toHaveBeenCalled();
  });

  it("uses the Chinese title for a cancelled zh-HK pass", async () => {
    const result = await loadPassPage("tok", {
      verify: () => ({...claims, v: 1}),
      passForSeat: async () => ({status: "cancelled", view: {seatId: claims.seatId, orderId: "o", eventId: claims.eventId, position: 1, attendeeName: "Ada", checkedInAt: null, eventTitleEn: "Edge AI", eventTitleZh: "邊緣 AI", eventSlug: "edge-ai", eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: null, buyerLocale: "zh-HK"}}),
    });
    if (result?.state !== "cancelled") throw new Error("expected a cancelled pass result");
    expect(result.eventTitle).toBe("邊緣 AI");
  });
});

describe("the pass route", () => {
  beforeEach(() => { navigation.notFound.mockClear(); });

  it("reaches notFound() for an invalid token instead of rendering a blank page", async () => {
    vi.mocked(loadPassPage).mockResolvedValueOnce(null);

    await expect(PassPage({params: Promise.resolve({locale: "en", token: "bad"})})).rejects.toThrow("NEXT_NOT_FOUND_SENTINEL");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });

  it("renders the cancelled notice and the refund policy instead of a QR", async () => {
    vi.mocked(loadPassPage).mockResolvedValueOnce({
      state: "cancelled", attendeeName: "Ada", eventTitle: "Edge AI",
      eventStartsAt: new Date("2026-12-01T11:00:00Z"), eventVenue: "Cyberport",
    });

    const html = renderToStaticMarkup(await PassPage({params: Promise.resolve({locale: "en", token: "tok"})}));

    expect(html).toContain("cancelled.heading");
    expect(html).toContain("cancelled.body");
    expect(html).toContain("/refund-policy");
    // No QR: a check-in code on a cancelled pass would invite a scan that the
    // check-in refuses anyway.
    expect(html).not.toContain("<svg");
    expect(navigation.notFound).not.toHaveBeenCalled();
  });
});
