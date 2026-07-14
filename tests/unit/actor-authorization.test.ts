import {describe, expect, it, vi} from "vitest";

import {getActor, requireActor, sessionToActor, systemActor} from "@/lib/auth/actor";
import * as authServer from "@/lib/auth/server";

describe("actor authorization", () => {
  it("converts a Neon session into a member actor", () => {
    expect(
      sessionToActor({
        user: {id: "user-a"},
      }),
    ).toEqual({kind: "member", userId: "user-a"});
  });

  it("returns null for an absent session", () => {
    expect(sessionToActor(null)).toBeNull();
  });

  it("requires an authenticated actor", async () => {
    vi.spyOn(authServer, "getSession").mockResolvedValue(null);
    await expect(requireActor()).rejects.toThrow("UNAUTHORIZED");
  });

  it("returns the current actor from the server session", async () => {
    vi.spyOn(authServer, "getSession").mockResolvedValue({user: {id: "user-a"}} as never);
    await expect(getActor()).resolves.toEqual({kind: "member", userId: "user-a"});
  });

  it("creates the only supported webhook system actor", () => {
    expect(systemActor("stripe-webhook")).toEqual({
      kind: "system",
      userId: null,
      source: "stripe-webhook",
    });
  });
});
