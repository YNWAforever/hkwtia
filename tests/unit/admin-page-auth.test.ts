import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({failure: "", notFoundCalls: 0}));
vi.mock("next/navigation", () => ({notFound: () => { state.notFoundCalls += 1; throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => {
  if (state.failure) throw new Error(state.failure);
  return {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};
}}));

import {requireAdminPageActor} from "@/lib/admin/page-auth";

describe("admin page authorization boundary", () => {
  beforeEach(() => { state.failure = ""; state.notFoundCalls = 0; });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("maps %s to a real not-found boundary", async (failure) => {
    state.failure = failure;
    await expect(requireAdminPageActor()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFoundCalls).toBe(1);
  });

  it("rethrows unrelated runtime failures", async () => {
    state.failure = "DATABASE_UNAVAILABLE";
    await expect(requireAdminPageActor()).rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(state.notFoundCalls).toBe(0);
  });
});