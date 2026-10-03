import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {createQueueCampaignAction} from "@/lib/admin/campaign-action-core";
import {AuthorizationError, type AdminActor} from "@/lib/membership/lifecycle";

const actor: AdminActor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};
const draftId = "22222222-2222-4222-8222-222222222222";
const initialState = {disposition: null, recipientCount: 0, error: null} as const;

function queueForm(): FormData {
  const formData = new FormData();
  formData.set("segmentId", "11111111-1111-4111-8111-111111111111");
  formData.set("template", "renewal-reminder");
  formData.set("idempotencyKey", "99999999-9999-4999-8999-999999999999");
  return formData;
}

describe("campaign queue action", () => {
  it("authenticates a stale shortcut without any queue or revalidation effect", async () => {
    const queue = vi.fn(); const revalidate = vi.fn(); const actorReader = vi.fn(async () => actor);
    const action = createQueueCampaignAction({draftId, path: "/en/admin/segments", dependencies: {actor: actorReader, queue, revalidate}});
    await expect(action(initialState, queueForm())).resolves.toEqual({disposition: null, recipientCount: 0, error: "generic"});
    expect(actorReader).toHaveBeenCalledOnce(); expect(queue).not.toHaveBeenCalled(); expect(revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["validation", new z.ZodError([])],
    ["missing segment", new Error("Campaign segment was not found")],
    ["idempotency conflict", new Error("Campaign idempotency claim was not visible")],
    ["database", new Error("password=secret database unavailable")],
  ])("returns one safe state without revalidation for a %s failure", async (_name, failure) => {
    const paths: string[] = [];
    const action = createQueueCampaignAction({draftId, path: "/en/admin/segments", dependencies: {
      actor: async () => actor,
      queue: async () => { throw failure; },
      revalidate: (path) => { paths.push(path); },
    }});

    await expect(action(initialState, queueForm())).resolves.toEqual({disposition: null, recipientCount: 0, error: "generic"});
    expect(paths).toEqual([]);
  });

  it.each([new Error("UNAUTHORIZED"), new AuthorizationError()])("propagates actor authorization denial $message", async (failure) => {
    const queue = vi.fn();
    const revalidate = vi.fn();
    const action = createQueueCampaignAction({draftId, path: "/en/admin/segments", dependencies: {
      actor: async () => { throw failure; },
      queue,
      revalidate,
    }});

    await expect(action(initialState, queueForm())).rejects.toBe(failure);
    expect(queue).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns the safe state for an unrelated actor failure", async () => {
    const revalidate = vi.fn();
    const action = createQueueCampaignAction({draftId, path: "/en/admin/segments", dependencies: {
      actor: async () => { throw new Error("session database unavailable"); },
      queue: vi.fn(),
      revalidate,
    }});

    await expect(action(initialState, queueForm())).resolves.toEqual({disposition: null, recipientCount: 0, error: "generic"});
    expect(revalidate).not.toHaveBeenCalled();
  });
});
