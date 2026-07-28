import {describe, expect, it, vi} from "vitest";

import {getActor, requireActor, sessionToActor, systemActor} from "@/lib/auth/actor";
import {
  requireAgentRunActor,
  requireScheduledAgent,
} from "@/lib/auth/agent-actor";
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

describe("agent actor authorization", () => {
  const scheduled = {
    kind: "agent" as const,
    agent: "retention_analyst" as const,
    runId: "33333333-3333-4333-8333-333333333333",
    conversationId: null,
    profileId: null,
    trigger: "scheduled" as const,
  };
  const concierge = {
    kind: "agent" as const,
    agent: "concierge" as const,
    runId: "22222222-2222-4222-8222-222222222222",
    conversationId: "11111111-1111-4111-8111-111111111111",
    profileId: "profile-1",
    trigger: "web" as const,
  };

  it("accepts and returns the exact scheduled agent identity", () => {
    expect(requireScheduledAgent(scheduled, "retention_analyst")).toBe(scheduled);
  });

  it.each([
    {kind: "staff", userId: "staff-1", profileId: "staff-1"},
    {kind: "member", userId: "member-1", profileId: "member-1"},
    concierge,
    {...scheduled, agent: "board_reporter"},
  ])("rejects a non-matching scheduled identity", (candidate) => {
    expect(() => requireScheduledAgent(candidate as never, "retention_analyst"))
      .toThrow("FORBIDDEN");
  });

  it("accepts only complete Concierge or scheduled run actors", () => {
    expect(requireAgentRunActor(concierge)).toBe(concierge);
    expect(requireAgentRunActor(scheduled)).toBe(scheduled);
    expect(() => requireAgentRunActor({
      kind: "system",
      userId: null,
      source: "stripe-webhook",
    }))
      .toThrow("FORBIDDEN");
  });
});
