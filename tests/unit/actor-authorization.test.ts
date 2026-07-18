import {describe, expect, it, vi} from "vitest";

import {getActor, requireActor, sessionToActor, systemActor} from "@/lib/auth/actor";
import * as authServer from "@/lib/auth/server";

describe("actor authorization", () => {
  it("converts a Neon session into a member actor", async () => {
    await expect(Promise.resolve(sessionToActor(
      {user: {id: "user-a"}},
      {resolve: vi.fn().mockResolvedValue({profileId: "user-a", role: "member"})},
    ))).resolves.toEqual({kind: "member", userId: "user-a", profileId: "user-a"});
  });

  it("resolves staff from the application profile, not session metadata", async () => {
    const resolver = {resolve: vi.fn().mockResolvedValue({profileId: "staff-1", role: "staff" as const})};

    await expect(Promise.resolve(sessionToActor({user: {id: "auth-1"}}, resolver))).resolves.toEqual({
      kind: "staff", userId: "auth-1", profileId: "staff-1",
    });
  });

  it("returns null for an absent session", async () => {
    await expect(Promise.resolve(sessionToActor(null, {resolve: vi.fn()}))).resolves.toBeNull();
  });

  it("requires an authenticated actor", async () => {
    vi.spyOn(authServer, "getSession").mockResolvedValue(null);
    await expect(requireActor()).rejects.toThrow("UNAUTHORIZED");
  });

  it("returns the current actor from the server session", async () => {
    vi.spyOn(authServer, "getSession").mockResolvedValue({user: {id: "user-a"}} as never);
    await expect(getActor({resolve: vi.fn().mockResolvedValue({profileId: "user-a", role: "member"})})).resolves.toEqual({kind: "member", userId: "user-a", profileId: "user-a"});
  });

  it("creates the only supported webhook system actor", () => {
    expect(systemActor("stripe-webhook")).toEqual({
      kind: "system",
      userId: null,
      source: "stripe-webhook",
    });
  });
});
