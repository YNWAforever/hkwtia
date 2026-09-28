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
