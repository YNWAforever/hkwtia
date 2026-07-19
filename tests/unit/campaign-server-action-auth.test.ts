import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({authorizationFailure: "UNAUTHORIZED", notFoundCalls: 0}));

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFoundCalls += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => { throw new Error(state.authorizationFailure); },
}));

import {queueCampaignAction} from "@/lib/admin/campaign-actions";

const initialState = {disposition: null, recipientCount: 0, error: null} as const;

describe("campaign queue genuine Server Action authorization", () => {
  beforeEach(() => { state.notFoundCalls = 0; });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("maps %s to notFound", async (failure) => {
    state.authorizationFailure = failure;

    await expect(queueCampaignAction(
      "22222222-2222-4222-8222-222222222222",
      "/en/admin/segments",
      initialState,
      new FormData(),
    )).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFoundCalls).toBe(1);
  });
});
