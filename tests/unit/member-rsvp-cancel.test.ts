import {describe, expect, it, vi} from "vitest";

import {cancelOwnEventRegistration} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const eventId = "11111111-1111-4111-8111-111111111111";
const member = {kind: "member", userId: "user-a", profileId: "profile-a"} as const satisfies Actor;

function harness(status: string | null) {
  const state = {status, promoted: false};
  const audit = vi.fn(async () => undefined);
  const markCancelled = vi.fn(async () => { state.status = "cancelled"; });
  const dependencies = {transaction: async <T>(work: (tx: {
    lockEvent: () => Promise<{slug: string; titleEn: string; titleZh: string | null}>;
    lockRegistration: () => Promise<{status: string} | null>;
    markCancelled: () => Promise<void>;
    insertAudit: typeof audit;
  }) => Promise<T>) => work({
    lockEvent: async () => ({slug: "clinic", titleEn: "Clinic", titleZh: null}),
    lockRegistration: async () => status === null ? null : {status: state.status ?? status},
    markCancelled,
    insertAudit: audit,
  })};
  return {state, audit, markCancelled, dependencies};
}

describe("member self-cancel RSVP", () => {
  it("cancels the member's own registered seat, audits it, and does not promote the waitlist", async () => {
    const {audit, markCancelled, dependencies, state} = harness("registered");
    await expect(cancelOwnEventRegistration(member, {eventId}, dependencies)).resolves.toEqual({disposition: "cancelled"});
    expect(markCancelled).toHaveBeenCalledWith(eventId, member.profileId);
    expect(state.status).toBe("cancelled");
    expect(state.promoted).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "event.registration.cancelled", actorUserId: member.profileId, targetId: eventId,
      metadata: {previousStatus: "registered"},
    }));
  });

  it.each(["attended", "no_show"] as const)("refuses to cancel a %s row", async (status) => {
    const {markCancelled, dependencies} = harness(status);
    await expect(cancelOwnEventRegistration(member, {eventId}, dependencies)).resolves.toEqual({disposition: "not_cancellable"});
    expect(markCancelled).not.toHaveBeenCalled();
  });

  it("reports a missing registration without writing", async () => {
    const {markCancelled, audit, dependencies} = harness(null);
    await expect(cancelOwnEventRegistration(member, {eventId}, dependencies)).resolves.toEqual({disposition: "not_registered"});
    expect(markCancelled).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
