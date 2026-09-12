import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({redirectUrl: null as string | null}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("@/lib/auth/actor", () => ({
  getActor: vi.fn(async () => null),
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({getDashboard: vi.fn(async () => { throw new Error("getDashboard must not run for an admin actor"); })}));

import {getActor, requireActor} from "@/lib/auth/actor";
import PortalPage from "@/app/[locale]/(member)/portal/page";

describe("portal admin redirect", () => {
  beforeEach(() => { state.redirectUrl = null; });

  // Regression: a staff actor cleared PortalLayout's requireActor() and then threw
  // FORBIDDEN inside getDashboard()'s requireMember(), showing the error boundary.
  it.each([
    ["staff", "en", "/admin"],
    ["exco", "zh-HK", "/zh/admin"],
    ["superadmin", "en", "/admin"],
  ] as const)("sends a %s actor to the admin surface instead of rendering the member dashboard", async (kind, locale, expected) => {
    vi.mocked(getActor).mockResolvedValueOnce({kind, userId: "u2", profileId: "p2"});

    await expect(
      PortalPage({params: Promise.resolve({locale})}),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe(expected);
  });

  it("leaves a member actor on the dashboard path", async () => {
    vi.mocked(getActor).mockResolvedValueOnce({kind: "member", userId: "u3", profileId: "p3"});
    vi.mocked(requireActor).mockResolvedValueOnce({kind: "member", userId: "u3", profileId: "p3"});

    // getDashboard is mocked to throw if reached with a non-member; reaching it at all
    // proves the guard let a member through.
    await expect(PortalPage({params: Promise.resolve({locale: "en"})})).rejects.toThrow("getDashboard must not run");
    expect(state.redirectUrl).toBeNull();
  });
});
