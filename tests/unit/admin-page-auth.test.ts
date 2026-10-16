import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({failure: "", notFoundCalls: 0, redirectCalls: [] as string[]}));
vi.mock("next/navigation", () => ({
  notFound: () => { state.notFoundCalls += 1; throw new Error("NEXT_NOT_FOUND"); },
  redirect: (path: string) => { state.redirectCalls.push(path); throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("next-intl/server", () => ({getLocale: async () => "en"}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => {
  if (state.failure) throw new Error(state.failure);
  return {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};
}}));

import {requireAdminPageActor} from "@/lib/admin/page-auth";

describe("admin page authorization boundary", () => {
  beforeEach(() => { state.failure = ""; state.notFoundCalls = 0; state.redirectCalls = []; });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("routes %s to the public staff entry", async (failure) => {
    state.failure = failure;
    await expect(requireAdminPageActor()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectCalls).toEqual(["/admin-login"]);
    expect(state.notFoundCalls).toBe(0);
  });

  it("rethrows unrelated runtime failures", async () => {
    state.failure = "DATABASE_UNAVAILABLE";
    await expect(requireAdminPageActor()).rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(state.notFoundCalls).toBe(0);
    expect(state.redirectCalls).toEqual([]);
  });
});