import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({redirectUrl: null as string | null}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("@/lib/auth/actor", () => ({getActor: vi.fn(async () => null)}));

import {getActor} from "@/lib/auth/actor";
import MemberLoginPage from "@/app/[locale]/member-login/page";

describe("MemberLoginPage", () => {
  beforeEach(() => {
    state.redirectUrl = null;
  });

  // Regression: clicking the magic-link email landed an authenticated actor
  // back on this page with a dead-end "already signed in" message and no
  // way forward. Mirrors /join's page.tsx, which already redirects.
  it("redirects an already-authenticated actor to the continuation instead of showing a login form", async () => {
    vi.mocked(getActor).mockResolvedValueOnce({kind: "member", userId: "u1", profileId: "p1"});

    await expect(
      MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({next: "/portal/billing"})}),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe("/portal/billing");
  });

  it("redirects an authenticated actor to the default portal when next is absent", async () => {
    vi.mocked(getActor).mockResolvedValueOnce({kind: "staff", userId: "u2", profileId: "p2"});

    await expect(
      MemberLoginPage({params: Promise.resolve({locale: "zh-HK"}), searchParams: Promise.resolve({})}),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe("/zh/portal");
  });

  it("renders an email field and a submit control when unauthenticated", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
    expect(screen.getByLabelText("emailLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "submit"})).toBeInTheDocument();
  });

  it("fails open to the default target when next fails the continuation parser", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({next: "/admin"})}));
    const form = screen.getByTestId("member-login-form");
    expect(form).toHaveAttribute("data-continuation", "/portal");
  });

  it("preserves a valid continuation", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({next: "/portal/billing"})}));
    const form = screen.getByTestId("member-login-form");
    expect(form).toHaveAttribute("data-continuation", "/portal/billing");
  });
});
