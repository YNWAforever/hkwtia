import {describe, expect, it, vi} from "vitest";

import {runPublicEventRegistrationAction} from "@/lib/events/registration-action";

const form = () => {
  const data = new FormData();
  data.set("eventId", "11111111-1111-4111-8111-111111111111");
  return data;
};

const messages = {
  registered: "Registered.",
  waitlist: "Added to waitlist.",
  alreadyRegistered: "Already registered.",
  alreadyWaitlisted: "Already waitlisted.",
  unauthenticated: "Sign in to register.",
  ineligible: "Membership required.",
  closed: "Registration is closed.",
  error: "Unable to register.",
};
const actor = {kind: "member", userId: "auth-member", profileId: "profile-member"} as const;

describe("public Event registration action", () => {
  it.each([
    ["registered", {code: "registered", message: messages.registered}],
    ["waitlist", {code: "waitlist", message: messages.waitlist}],
    ["already_registered", {code: "already_registered", message: messages.alreadyRegistered}],
    ["already_waitlisted", {code: "already_waitlisted", message: messages.alreadyWaitlisted}],
  ] as const)("maps the %s registration disposition", async (disposition, expected) => {
    const register = vi.fn(async () => ({disposition}));

    await expect(runPublicEventRegistrationAction({}, form(), {
      requireActor: async () => actor,
      register,
      messages,
    })).resolves.toEqual(expected);
    expect(register).toHaveBeenCalledWith(actor, {eventId: "11111111-1111-4111-8111-111111111111"});
  });

  it.each([
    ["UNAUTHORIZED", {code: "unauthenticated", message: messages.unauthenticated}],
    ["MEMBERSHIP_INACTIVE", {code: "ineligible", message: messages.ineligible}],
    ["EVENT_REGISTRATION_CLOSED", {code: "closed", message: messages.closed}],
    ["EVENT_NOT_FOUND", {code: "error", message: messages.error}],
  ] as const)("maps the known %s error", async (failure, expected) => {
    await expect(runPublicEventRegistrationAction({}, form(), {
      requireActor: async () => { throw new Error(failure); },
      register: async () => ({disposition: "registered"}),
      messages,
    })).resolves.toEqual(expected);
  });

  it("maps only known registration results and never leaks an unknown error", async () => {
    await expect(runPublicEventRegistrationAction({}, form(), {
      requireActor: async () => actor,
      register: async () => { throw new Error("secret database payload"); },
      messages,
    })).resolves.toEqual({code: "error", message: messages.error});
  });
});
