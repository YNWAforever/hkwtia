import {describe, expect, it, vi} from "vitest";

import {runCompMembershipAction} from "@/lib/admin/membership-comp-action-core";

const messages = {
  successMessage: "comped",
  validationMessage: "invalid",
  errorMessage: "failed",
};

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe("runCompMembershipAction", () => {
  it("reports success after the mutation runs", async () => {
    const mutate = vi.fn(async () => undefined);
    const state = await runCompMembershipAction({}, formData({profileId: "p-1", planCode: "community"}), {...messages, mutate});

    expect(mutate).toHaveBeenCalledWith({profileId: "p-1", planCode: "community"});
    expect(state).toEqual({status: "success", message: "comped"});
  });

  it("reports a validation failure without echoing an unknown plan back as success", async () => {
    const mutate = vi.fn(async () => undefined);
    const state = await runCompMembershipAction({}, formData({profileId: "p-1", planCode: "platinum"}), {...messages, mutate});

    expect(mutate).not.toHaveBeenCalled();
    expect(state.status).toBe("error");
    expect(state.message).toBe("invalid");
  });

  it("surfaces a failed mutation as an error rather than a silent success", async () => {
    const mutate = vi.fn(async () => { throw new Error("MEMBERSHIP_PLAN_NOT_FOUND"); });
    const state = await runCompMembershipAction({}, formData({profileId: "p-1", planCode: "community"}), {...messages, mutate});

    expect(state).toEqual({status: "error", message: "failed"});
  });

  it("lets an authorization denial through so the caller can hide the surface", async () => {
    const mutate = vi.fn(async () => { throw new Error("FORBIDDEN"); });

    await expect(runCompMembershipAction({}, formData({profileId: "p-1", planCode: "community"}), {...messages, mutate}))
      .rejects.toThrow("FORBIDDEN");
  });
});
