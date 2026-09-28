import {renderToStaticMarkup} from "react-dom/server";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const social = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({authClient: {signIn: {social}}}));
const state = vi.hoisted(() => ({
  actor: null as {kind: "member"; userId: string} | null,
  redirectUrl: null as string | null,
  startJoinCalls: [] as unknown[][],
  ownedApplications: [] as Array<Record<string, unknown>>,
  loginResolution: {kind: "signed-out"} as {kind: string},
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => `localized:${key}`,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => state.actor}));
vi.mock("@/lib/auth/login-resolution-server", () => ({resolveCurrentLogin: async () => state.loginResolution}));
vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {listOwned: async () => state.ownedApplications}}));
vi.mock("@/lib/membership/join-service", () => ({
  startJoin: async (...args: unknown[]) => { state.startJoinCalls.push(args); return {applicationId: "application-a", next: "profile"}; },
}));
vi.mock("@/components/join/join-form", () => ({
  JoinForm: ({children}: {children: ReactNode}) => <form>{children}</form>,
}));
vi.mock("@/components/join/progress", () => ({
  JoinProgress: ({active}: {active: string}) => <div data-active={active}/> ,
}));
vi.mock("@/app/[locale]/(join)/join/actions", () => ({requestMagicLink: vi.fn(), resumeJoinAction: vi.fn()}));

import JoinPage from "@/app/[locale]/(join)/join/page";

function props(locale = "en", searchParams: Record<string, string> = {next: "/portal"}) {
  return {params: Promise.resolve({locale}), searchParams: Promise.resolve(searchParams)};
}

describe("JoinPage portal continuation auth", () => {
  beforeEach(() => {
    state.actor = null;
    state.redirectUrl = null;
    state.startJoinCalls = [];
    state.ownedApplications = [];
    social.mockReset();
    state.loginResolution = {kind: "signed-out"};
  });

  it("renders the localized auth form when a portal continuation has no plan", async () => {
    const markup = renderToStaticMarkup(await JoinPage(props("en", {next: "/portal"})));

    expect(markup).toContain('data-active="auth"');
    expect(markup).toContain('name="email"');
    expect(markup).not.toContain("invalidPlanTitle");
    expect(state.startJoinCalls).toHaveLength(0);
  });

  it("offers Google and returns to the selected plan and application after authentication", async () => {
    social.mockResolvedValue({data: {}, error: null});
    const application = "1a538745-848b-448f-94d6-3b6a92f4e891";
    const previous = process.env.AUTH_GOOGLE_ENABLED;
    process.env.AUTH_GOOGLE_ENABLED = "true";
    try {
      render(await JoinPage(props("zh-HK", {plan: "startup", application})));
      fireEvent.click(screen.getByRole("button", {name: "localized:google"}));
      await waitFor(() => expect(social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: `/zh/member-login?next=${encodeURIComponent(`/join?plan=startup&application=${application}`)}`,
      }));
    } finally {
      if (previous === undefined) delete process.env.AUTH_GOOGLE_ENABLED;
      else process.env.AUTH_GOOGLE_ENABLED = previous;
    }
  });
  it("sends a verified provider subject without a profile to onboarding with the selected plan", async () => {
    state.loginResolution = {kind: "needs-profile"};
    await expect(JoinPage(props("zh-HK", {plan: "startup"}))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe("/zh/member-login?next=%2Fjoin%3Fplan%3Dstartup");
  });
  it("renders the plan chooser on a bare /join and the unavailable state for a malformed plan", async () => {
    const chooser = renderToStaticMarkup(await JoinPage(props("zh-HK", {})));
    expect(chooser).toContain("localized:choosePlanTitle");
    expect(chooser).toContain('href="/zh/join?plan=startup"');
    expect(chooser).toContain('href="/zh/contact"');
    expect(chooser).toContain('data-active="plan"');

    const malformed = renderToStaticMarkup(await JoinPage(props("en", {plan: "gold"})));
    expect(malformed).toContain("localized:invalidPlanTitle");
    expect(malformed).not.toContain("localized:choosePlanTitle");
  });

  it("renders a signed-in plan entry without creating an application during GET", async () => {
    state.actor = {kind: "member", userId: "user-a"};
    const markup = renderToStaticMarkup(await JoinPage(props("en", {plan: "startup"})));
    expect(state.startJoinCalls).toHaveLength(0);
    expect(state.redirectUrl).toBeNull();
    expect(markup).toContain("localized:resume.start");
  });

  it("shows owned resumable state and keeps the explicit new path separate", async () => {
    state.actor = {kind: "member", userId: "user-a"};
    state.ownedApplications = [{id: "application-a", planCode: "startup", status: "pending_payment", currentStep: "profile", updatedAt: new Date("2026-09-27T00:00:00Z")}];
    const markup = renderToStaticMarkup(await JoinPage(props("en", {plan: "startup", application: "application-a"})));
    expect(markup).toContain("localized:resume.steps.checkout");
    expect(markup).toContain("localized:resume.lastSaved");
    expect(markup).toContain('name="applicationId"');
    expect(markup).toContain('name="intent"');
    expect(state.startJoinCalls).toHaveLength(0);
    await expect(JoinPage(props("en", {plan: "startup", application: "foreign"}))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects an authenticated no-plan continuation directly to the portal", async () => {
    state.actor = {kind: "member", userId: "user-a"};

    await expect(JoinPage(props("zh-HK", {next: "/portal/profile"}))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe("/zh/portal/profile");
    expect(state.startJoinCalls).toHaveLength(0);
  });
});
