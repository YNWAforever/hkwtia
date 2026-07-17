import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  actor: null as {kind: "member"; userId: string} | null,
  redirectUrl: null as string | null,
  startJoinCalls: [] as unknown[][],
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
vi.mock("@/lib/membership/join-service", () => ({
  startJoin: async (...args: unknown[]) => { state.startJoinCalls.push(args); return {applicationId: "application-a", next: "profile"}; },
}));
vi.mock("@/components/join/join-form", () => ({
  JoinForm: ({children}: {children: ReactNode}) => <form>{children}</form>,
}));
vi.mock("@/components/join/progress", () => ({
  JoinProgress: ({active}: {active: string}) => <div data-active={active}/> ,
}));
vi.mock("@/app/[locale]/(join)/join/actions", () => ({requestMagicLink: vi.fn()}));

import JoinPage from "@/app/[locale]/(join)/join/page";

function props(locale = "en", searchParams: Record<string, string> = {next: "/portal"}) {
  return {params: Promise.resolve({locale}), searchParams: Promise.resolve(searchParams)};
}

describe("JoinPage portal continuation auth", () => {
  beforeEach(() => {
    state.actor = null;
    state.redirectUrl = null;
    state.startJoinCalls = [];
  });

  it("renders the localized auth form when a portal continuation has no plan", async () => {
    const markup = renderToStaticMarkup(await JoinPage(props("en", {next: "/portal"})));

    expect(markup).toContain('data-active="auth"');
    expect(markup).toContain('name="email"');
    expect(markup).not.toContain("invalidPlanTitle");
    expect(state.startJoinCalls).toHaveLength(0);
  });

  it("redirects an authenticated no-plan continuation directly to the portal", async () => {
    state.actor = {kind: "member", userId: "user-a"};

    await expect(JoinPage(props("zh-HK", {next: "/portal/profile"}))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe("/zh/portal/profile");
    expect(state.startJoinCalls).toHaveLength(0);
  });
});
