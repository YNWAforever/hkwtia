import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {runCheckInAction, runEventFormAction} from "@/lib/admin/event-action-core";
import {runEventRegistrationAction} from "@/lib/portal/event-action-core";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("safe localized event action states", () => {
  it("returns localized field errors and preserves non-sensitive event inputs", async () => {
    const state = await runEventFormAction({}, form({slug: "bad slug", titleEn: "Draft title"}), {
      validationMessage: "Check the fields.", errorMessage: "Try again.", successMessage: "Saved.",
      mutate: async () => { throw new z.ZodError([{code: "custom", path: ["slug"], message: "invalid slug"}]); },
    });
    expect(state).toMatchObject({status: "error", message: "Check the fields.", fieldErrors: {slug: "Check the fields."}, values: {slug: "bad slug", titleEn: "Draft title"}});
  });

  it("returns generic localized errors without leaking domain payloads", async () => {
    const checkIn = await runCheckInAction({}, form({profileId: "private-profile"}), {successMessage: "Checked in.", errorMessage: "Unable to check in.", mutate: async () => { throw new Error("DB payload private-profile"); }});
    const registration = await runEventRegistrationAction({}, form({eventId: "11111111-1111-4111-8111-111111111111"}), {successMessage: "Registered.", errorMessage: "Unable to register.", mutate: async () => { throw new Error("expired profile-private"); }});
    expect(checkIn).toEqual({status: "error", message: "Unable to check in."});
    expect(registration).toEqual({status: "error", message: "Unable to register."});
  });

  it("returns localized success without exposing the mutation result", async () => {
    const mutate = vi.fn(async () => ({disposition: "registered" as const}));
    await expect(runEventRegistrationAction({}, form({eventId: "11111111-1111-4111-8111-111111111111"}), {successMessage: "Registered.", errorMessage: "Unable.", mutate})).resolves.toEqual({status: "success", message: "Registered."});
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("rethrows %s from admin event mutations for 404 mapping", async (failure) => {
    const denied = async () => { throw new Error(failure); };
    await expect(runEventFormAction({}, form({slug: "event"}), {successMessage: "Saved.", validationMessage: "Invalid.", errorMessage: "Unable.", mutate: denied})).rejects.toThrow(failure);
    await expect(runCheckInAction({}, form({profileId: "member"}), {successMessage: "Saved.", errorMessage: "Unable.", mutate: denied})).rejects.toThrow(failure);
  });
});
