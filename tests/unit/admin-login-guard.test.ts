import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({failure: "", locale: "en", redirects: [] as string[]}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (path: string) => { state.redirects.push(path); throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("next-intl/server", () => ({getLocale: async () => state.locale}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => {
  if (state.failure) throw new Error(state.failure);
  return {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};
}}));

import {requireAdminPageActor} from "@/lib/admin/page-auth";

describe("admin login guard", () => {
  it("retains a safe case destination after authorization denial in the current locale", async () => {
    state.failure = "UNAUTHORIZED"; state.locale = "zh-HK";
    const destination = "/admin/members/queue/1a538745-848b-448f-94d6-3b6a92f4e891";
    await expect(requireAdminPageActor(destination)).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirects).toEqual(["/zh/admin-login?" + new URLSearchParams({next:destination}).toString()]);
  });
  it("retains safe inbox scope after authorization denial", async () => {
    state.failure = "UNAUTHORIZED";
    const destination = "/admin/inbox?channel=web&handling=human&scope=mine";
    await expect(requireAdminPageActor(destination)).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirects).toEqual(["/admin-login?" + new URLSearchParams({next:destination}).toString()]);
  });
  it.each(["https://evil.example/admin", "/admin/inbox?scope=other", "/admin/members/queue/not-a-uuid"])("denial never retains unsafe destination %s", async (destination) => {
    state.failure = "UNAUTHORIZED";
    await expect(requireAdminPageActor(destination)).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirects).toEqual(["/admin-login"]);
  });
  it("does not convert a session provider outage into a signed-out redirect", async () => {
    state.failure = "SESSION_PROVIDER_UNAVAILABLE";
    await expect(requireAdminPageActor("/admin/inbox")).rejects.toThrow("SESSION_PROVIDER_UNAVAILABLE");
    expect(state.redirects).toEqual([]);
  });

  beforeEach(() => { state.failure = ""; state.locale = "en"; state.redirects = []; });

  it("directs an anonymous visitor to staff login in the current locale", async () => {
    state.failure = "UNAUTHORIZED";
    state.locale = "zh-HK";
    await expect(requireAdminPageActor()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirects).toEqual(["/zh/admin-login"]);
  });

  it("directs an authenticated non-staff actor to staff login for a clear denial", async () => {
    state.failure = "FORBIDDEN";
    await expect(requireAdminPageActor()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirects).toEqual(["/admin-login"]);
  });
});
