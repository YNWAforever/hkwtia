import {beforeEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn((): never => { throw new Error("NEXT_NOT_FOUND_SENTINEL"); }),
}));

const auth = vi.hoisted(() => ({
  requireAdminPageActor: vi.fn(async () => ({kind: "staff", userId: "auth-1", profileId: "p-1"})),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/admin/page-auth", () => auth);

// The page module is the only caller that reaches `loadCheckIn(token)` with no
// injected dependencies, and those defaults read the pass secret and the
// database. Wrapping the real loader (rather than replacing it) lets the page's
// not-found path be driven without either, while the loader cases below still
// exercise the real implementation.
vi.mock("@/lib/tickets/check-in-page", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tickets/check-in-page")>();
  return {...actual, loadCheckIn: vi.fn(actual.loadCheckIn)};
});

import CheckInPage from "@/app/[locale]/(admin)/admin/check-in/[token]/page";
import type {PassView} from "@/lib/db/repos/ticket-check-in";
import {createCheckInLoader, loadCheckIn, type CheckInPageDependencies} from "@/lib/tickets/check-in-page";
import type {PassClaims} from "@/lib/tickets/pass-token";

const claims: PassClaims = {
  seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f",
  eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d",
};

function seat(overrides: Partial<PassView> = {}): PassView {
  return {
    seatId: claims.seatId,
    orderId: "order-1",
    eventId: claims.eventId,
    position: 1,
    attendeeName: "Ada Lovelace",
    checkedInAt: null,
    eventTitleEn: "Tech Night",
    eventTitleZh: "科技之夜",
    eventSlug: "tech-night",
    eventStartsAt: new Date("2026-10-01T10:00:00.000Z"),
    eventVenue: "HKSTP",
    buyerLocale: "en",
    ...overrides,
  };
}

function loader(overrides: Partial<CheckInPageDependencies> = {}) {
  return createCheckInLoader({
    verify: () => claims,
    passForSeat: async () => seat(),
    ...overrides,
  });
}

describe("the check-in loader", () => {
  it("resolves ready for an admissible seat that has not been checked in", async () => {
    await expect(loader()("tok")).resolves.toEqual({state: "ready", seat: seat()});
  });

  it("resolves already_checked_in once the seat carries a check-in time", async () => {
    const checkedInAt = new Date("2026-09-16T01:00:00.000Z");

    await expect(loader({passForSeat: async () => seat({checkedInAt})})("tok"))
      .resolves.toEqual({state: "already_checked_in", seat: seat({checkedInAt})});
  });

  it("resolves null for an invalid token, before reading any seat", async () => {
    const passForSeat = vi.fn(async () => seat());

    await expect(loader({verify: () => null, passForSeat})("bad")).resolves.toBeNull();
    expect(passForSeat).not.toHaveBeenCalled();
  });

  it("resolves null for a seat that is inadmissible or does not exist", async () => {
    await expect(loader({passForSeat: async () => null})("tok")).resolves.toBeNull();
  });
});

describe("the check-in route", () => {
  beforeEach(() => {
    auth.requireAdminPageActor.mockResolvedValue({kind: "staff", userId: "auth-1", profileId: "p-1"});
    vi.mocked(loadCheckIn).mockClear();
  });

  it("checks the staff session before reading any seat", async () => {
    auth.requireAdminPageActor.mockRejectedValueOnce(new Error("UNAUTHORIZED_SENTINEL"));

    await expect(
      CheckInPage({params: Promise.resolve({locale: "en", token: "tok"})}),
    ).rejects.toThrow("UNAUTHORIZED_SENTINEL");
    expect(loadCheckIn).not.toHaveBeenCalled();
  });

  it("reaches notFound() for an invalid token or an inadmissible seat", async () => {
    vi.mocked(loadCheckIn).mockResolvedValueOnce(null);

    await expect(
      CheckInPage({params: Promise.resolve({locale: "en", token: "bad"})}),
    ).rejects.toThrow("NEXT_NOT_FOUND_SENTINEL");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });
});
