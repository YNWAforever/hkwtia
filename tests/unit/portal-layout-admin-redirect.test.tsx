import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({redirectUrl: null as string | null}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
// The layout's UNAUTHORIZED catch path reads request headers; unmocked, this module
// pulls in Next internals that assume a live request context (see join-actions.test.ts
// and member-login-actions.test.ts for the same pattern).
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
// PortalNav's import chain reaches i18n/navigation.ts, which calls next-intl's
// createNavigation() at module scope -- that needs the full next/navigation
// surface (permanentRedirect, usePathname, ...), not just redirect, so this
// mock must preserve the rest of the real module rather than replace it.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
  };
});
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));

import {requireActor} from "@/lib/auth/actor";
import PortalLayout from "@/app/[locale]/(member)/portal/layout";

describe("portal layout admin redirect", () => {
  beforeEach(() => { state.redirectUrl = null; });

  // Regression: a staff actor cleared this layout's requireActor() and only then hit
  // FORBIDDEN inside page.tsx's getDashboard(). Layout and page render in parallel, so
  // a page-only guard still lets the layout build the whole member shell -- two
  // getTranslations calls, localizeConcierge, InternalAppShell/PortalNav/ConciergeWidget
  // -- around someone about to be redirected away from it.
  it.each([
    ["staff", "en", "/admin"],
    ["exco", "zh-HK", "/zh/admin"],
    ["superadmin", "en", "/admin"],
  ] as const)("sends a %s actor to the admin surface instead of building the member shell", async (kind, locale, expected) => {
    vi.mocked(requireActor).mockResolvedValueOnce({kind, userId: "u2", profileId: "p2"});

    await expect(
      PortalLayout({children: null, params: Promise.resolve({locale})}),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe(expected);
  });

  it("falls through to building the member shell for a member actor", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({kind: "member", userId: "u3", profileId: "p3"});

    // No mock here throws for a member actor, so resolving at all (rather than
    // rejecting with NEXT_REDIRECT) proves the guard let it through.
    const result = await PortalLayout({children: null, params: Promise.resolve({locale: "en"})});

    expect(state.redirectUrl).toBeNull();
    expect(result).toBeTruthy();
  });
});
