import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const redirect = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_REDIRECT"); }));
vi.mock("next/navigation", () => ({redirect}));
const requireActor = vi.hoisted(() => vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})));
vi.mock("@/lib/auth/actor", () => ({requireActor}));
const acceptSeatInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/repos/seats", () => ({
  acceptSeatInvitation,
  SeatServiceError: class SeatServiceError extends Error {
    readonly code: string;
    constructor(code: string) { super(code); this.name = "SeatServiceError"; this.code = code; }
  },
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import SeatAcceptPage from "@/app/[locale]/(member)/portal/company/seats/accept/page";
import {beforeEach} from "vitest";

function props(searchParams: Record<string, string | undefined> = {}) {
  return {params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve(searchParams)};
}

describe("seat invitation acceptance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the seats page on a successful accept, for the invited identity only", async () => {
    acceptSeatInvitation.mockResolvedValueOnce({id: "s1"});
    await expect(SeatAcceptPage(props({token: "valid-token"}))).rejects.toThrow("NEXT_REDIRECT");
    expect(acceptSeatInvitation).toHaveBeenCalledWith(expect.objectContaining({userId: "u1", profileId: "p1"}), "valid-token");
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/portal/company/seats"));
  });

  it("renders a missing-token error without calling the service at all", async () => {
    render(await SeatAcceptPage(props({})));
    expect(acceptSeatInvitation).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("seats.errors.generic");
  });

  it("renders an error for an expired token without redirecting, without calling requireActor twice or leaking the raw error", async () => {
    const {SeatServiceError} = await import("@/lib/db/repos/seats");
    acceptSeatInvitation.mockRejectedValueOnce(new SeatServiceError("INVITATION_EXPIRED"));
    render(await SeatAcceptPage(props({token: "expired-token"})));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("seats.errors.generic");
  });

  it("renders an error for an already-accepted token, distinctly from a missing token, but with the same current (generic) copy", async () => {
    const {SeatServiceError} = await import("@/lib/db/repos/seats");
    acceptSeatInvitation.mockRejectedValueOnce(new SeatServiceError("INVITATION_ALREADY_ACCEPTED"));
    render(await SeatAcceptPage(props({token: "used-token"})));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("seats.errors.generic");
  });

  it("renders an error and does not redirect for an unexpected non-SeatServiceError failure", async () => {
    acceptSeatInvitation.mockRejectedValueOnce(new Error("unexpected"));
    render(await SeatAcceptPage(props({token: "some-token"})));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not call acceptSeatInvitation before requireActor resolves an actor", async () => {
    requireActor.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    render(await SeatAcceptPage(props({token: "valid-token"})));
    expect(acceptSeatInvitation).not.toHaveBeenCalled();
  });
});
