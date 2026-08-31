import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {runCheckInAction, runEventFormAction} from "@/lib/admin/event-action-core";
import {runEventRegistrationAction} from "@/lib/portal/event-action-core";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const messages = {registered: "Registered.", waitlist: "Waitlisted.", alreadyRegistered: "Already registered.", alreadyWaitlisted: "Already waitlisted.", unauthenticated: "Sign in.", ineligible: "Membership required.", closed: "Closed.", error: "Unable to register."};

describe("safe localized Event action states", () => {
  it("returns localized field errors and preserves non-sensitive Event inputs", async () => {
    const state = await runEventFormAction({}, form({slug: "bad slug", titleEn: "Draft title"}), {validationMessage: "Check the fields.", errorMessage: "Try again.", successMessage: "Saved.", mutate: async () => { throw new z.ZodError([{code: "custom", path: ["slug"], message: "invalid slug"}]); }});
    expect(state).toMatchObject({status: "error", message: "Check the fields.", fieldErrors: {slug: "Check the fields."}, values: {slug: "bad slug", titleEn: "Draft title"}});
  });

  it("returns generic localized errors without leaking domain payloads", async () => {
    const checkIn = await runCheckInAction({}, form({profileId: "private-profile"}), {successMessage: "Checked in.", errorMessage: "Unable to check in.", mutate: async () => { throw new Error("DB payload private-profile"); }});
    const registration = await runEventRegistrationAction({}, form({eventId: "11111111-1111-4111-8111-111111111111"}), {messages, mutate: async () => { throw new Error("expired profile-private"); }});
    expect(checkIn).toEqual({status: "error", message: "Unable to check in."});
    expect(registration).toEqual({code: "error", message: "Unable to register."});
  });

  it("returns the recognized Event disposition without exposing mutation payloads", async () => {
    const mutate = vi.fn(async () => ({disposition: "registered" as const, privatePayload: "do not expose"}));
    await expect(runEventRegistrationAction({}, form({eventId: "11111111-1111-4111-8111-111111111111"}), {messages, mutate})).resolves.toEqual({code: "registered", message: "Registered."});
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("rethrows %s from admin Event mutations for 404 mapping", async (failure) => {
    const denied = async () => { throw new Error(failure); };
    await expect(runEventFormAction({}, form({slug: "event"}), {successMessage: "Saved.", validationMessage: "Invalid.", errorMessage: "Unable.", mutate: denied})).rejects.toThrow(failure);
    await expect(runCheckInAction({}, form({profileId: "member"}), {successMessage: "Saved.", errorMessage: "Unable.", mutate: denied})).rejects.toThrow(failure);
  });
});
