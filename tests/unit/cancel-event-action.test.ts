import {beforeEach, describe, expect, it, vi} from "vitest";

import type {CancelEventMessages} from "@/lib/admin/event-action-core";
import zhHk from "@/messages/zh-HK.json";

const state = vi.hoisted(() => ({
  session: {kind: "staff", userId: "auth-1", profileId: "p-1"} as unknown,
  noSession: false,
  outcome: {status: "cancelled", event: {slug: "ai-clinic-2026"}} as unknown,
  calls: [] as unknown[],
}));

const cache = vi.hoisted(() => ({revalidatePath: vi.fn()}));
const navigation = vi.hoisted(() => ({notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); })}));

vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => navigation);

vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => {
    if (state.noSession) throw new Error("UNAUTHORIZED");
    return state.session;
  },
}));

vi.mock("@/lib/db/repos/events", () => ({
  cancelEvent: async (actor: unknown, eventId: unknown) => {
    state.calls.push({actor, eventId});
    return state.outcome;
  },
}));

// The sibling writes this module also exports are irrelevant here; stubbing the
// modules that would pull a live database or Stripe keeps the import focused on
// the cancel wrapper.
vi.mock("@/lib/billing/ticket-webhook-processor", () => ({sendSeatPass: vi.fn(), ticketProcessorDependencies: vi.fn()}));
vi.mock("@/lib/admin/events", () => ({checkInAttendee: vi.fn()}));

const EVENT_ID = "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d";
const EVENT_PATH = `/en/admin/events-mgmt/${EVENT_ID}`;

// Each slot is distinct, which is what makes the branch-selection assertions
// exact rather than nominal.
const MESSAGES: CancelEventMessages = {
  successMessage: "Event cancelled.",
  alreadyCancelledMessage: "This event was already cancelled, so nothing changed.",
  invalidTransitionMessage: "A draft or returned event cannot be cancelled.",
  notFoundMessage: "That event could not be found.",
  errorMessage: "We could not cancel this event. Please try again.",
};

// The real zh-HK copy the page binds: a regression to a hard-coded English
// literal cannot satisfy this set.
const ZH_MESSAGES: CancelEventMessages = {
  successMessage: zhHk.Admin.eventsMgmt.cancel.outcomes.success,
  alreadyCancelledMessage: zhHk.Admin.eventsMgmt.cancel.outcomes.alreadyCancelled,
  invalidTransitionMessage: zhHk.Admin.eventsMgmt.cancel.outcomes.invalidTransition,
  notFoundMessage: zhHk.Admin.eventsMgmt.cancel.outcomes.notFound,
  errorMessage: zhHk.Admin.eventsMgmt.cancel.outcomes.error,
};

function loadActions() {
  return import("@/lib/admin/event-actions");
}

describe("cancelEventAction", () => {
  beforeEach(() => {
    state.noSession = false;
    state.outcome = {status: "cancelled", event: {slug: "ai-clinic-2026"}};
    state.calls = [];
    cache.revalidatePath.mockClear();
    navigation.notFound.mockClear();
  });

  // An authorization denial must map to notFound, not to a normal outcome, and
  // the service must never run for someone who is not staff.
  it("refuses without a staff session, never reaches the repository, and hides the route", async () => {
    state.noSession = true;
    const {cancelEventAction} = await loadActions();

    await expect(cancelEventAction(EVENT_ID, EVENT_PATH, MESSAGES, {status: "success"}, new FormData())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(state.calls).toHaveLength(0);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("cancels the event, reports success and revalidates the admin page and both public listings", async () => {
    const {cancelEventAction} = await loadActions();

    await expect(
      cancelEventAction(EVENT_ID, EVENT_PATH, MESSAGES, {status: "success"}, new FormData()),
    ).resolves.toEqual({status: "success", message: MESSAGES.successMessage});

    expect(state.calls).toEqual([{actor: state.session, eventId: EVENT_ID}]);
    // A cancelled event must leave the public listing it was published in, so a
    // success that only refreshed the admin page would leave a stale listing.
    expect(cache.revalidatePath.mock.calls).toEqual([
      [EVENT_PATH],
      ["/en/events"],
      ["/zh-HK/events"],
      ["/en/events/ai-clinic-2026"],
      ["/zh-HK/events/ai-clinic-2026"],
    ]);
  });

  it("reports already cancelled as its own message and revalidates nothing", async () => {
    state.outcome = {status: "already_cancelled"};
    const {cancelEventAction} = await loadActions();

    await expect(
      cancelEventAction(EVENT_ID, EVENT_PATH, MESSAGES, {status: "success"}, new FormData()),
    ).resolves.toEqual({status: "error", message: MESSAGES.alreadyCancelledMessage});

    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a forbidden transition as its own message without revalidating", async () => {
    state.outcome = {status: "invalid_transition", from: "draft"};
    const {cancelEventAction} = await loadActions();

    await expect(
      cancelEventAction(EVENT_ID, EVENT_PATH, MESSAGES, {status: "success"}, new FormData()),
    ).resolves.toEqual({status: "error", message: MESSAGES.invalidTransitionMessage});

    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a missing event as its own message without revalidating", async () => {
    state.outcome = {status: "not_found"};
    const {cancelEventAction} = await loadActions();

    await expect(
      cancelEventAction(EVENT_ID, EVENT_PATH, MESSAGES, {status: "success"}, new FormData()),
    ).resolves.toEqual({status: "error", message: MESSAGES.notFoundMessage});

    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  // The whole point of the bound message set: a zh-HK staff member must not be
  // shown English for the one refusal that tells them nothing changed.
  it("reports the outcome in the locale whose message set the page bound", async () => {
    state.outcome = {status: "already_cancelled"};
    const {cancelEventAction} = await loadActions();

    const result = await cancelEventAction(EVENT_ID, EVENT_PATH, ZH_MESSAGES, {status: "success"}, new FormData());

    expect(result).toEqual({status: "error", message: ZH_MESSAGES.alreadyCancelledMessage});
    expect(result).not.toEqual({status: "error", message: MESSAGES.alreadyCancelledMessage});
  });
});

describe("the cancel action module boundary", () => {
  it("exports cancelEventAction as a runtime function and no actor-taking helper", async () => {
    const actions = await loadActions();

    expect(typeof actions.cancelEventAction).toBe("function");
  });
});
