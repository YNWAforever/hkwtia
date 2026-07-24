import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({authorizationFailure: "UNAUTHORIZED", notFoundCalls: 0}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => { state.notFoundCalls += 1; throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => { throw new Error(state.authorizationFailure); }}));

import {decideApprovalAction} from "@/lib/admin/approval-actions";

const messages = {success: "ok", validation: "invalid", alreadyDecided: "decided", notFound: "gone", error: "error"};

describe("approval genuine Server Action authorization", () => {
  beforeEach(() => { state.notFoundCalls = 0; });
  it.each(["UNAUTHORIZED", "FORBIDDEN"])("maps %s to notFound", async (failure) => {
    state.authorizationFailure = failure;
    await expect(decideApprovalAction("/en/admin/approvals", messages, {}, new FormData())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFoundCalls).toBe(1);
  });
});
