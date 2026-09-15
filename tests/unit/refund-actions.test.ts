import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  session: {kind: "staff", userId: "auth-1", profileId: "p-1"} as unknown,
  noSession: false,
  result: {status: "refunded"} as {status: string},
  calls: [] as Array<{actor: unknown; input: unknown}>,
}));

const cache = vi.hoisted(() => ({revalidatePath: vi.fn()}));

vi.mock("next/cache", () => cache);

vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => {
    if (state.noSession) throw new Error("UNAUTHORIZED");
    return state.session;
  },
}));

vi.mock("@/lib/tickets/refund-core", () => ({
  refundOrder: async (actor: unknown, input: unknown) => {
    state.calls.push({actor, input});
    return state.result;
  },
}));

const ORDER_ID = "b1a2c3d4-1111-4222-8333-944455566677";
const EVENT_PATH = "/en/admin/events-mgmt/8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d";

// The outcome wording is the action's own; each slot is distinct, which is what
// makes the branch-selection assertions below exact rather than nominal.
const MESSAGES = {
  refunded: "Refunded.",
  already_refunded: "This order was already refunded.",
  not_admissible: "This order is not payable, so there is nothing to refund.",
  provider_failed: "The refund did not go through, so nothing was charged back. You can try again.",
  not_found: "That order could not be found.",
} as const;

function form(orderId: string = ORDER_ID, note?: string): FormData {
  const data = new FormData();
  data.set("orderId", orderId);
  if (note !== undefined) data.set("note", note);
  return data;
}

function loadActions() {
  return import("@/lib/tickets/refund-actions");
}

describe("the refund action module boundary", () => {
  it("exports only the formData wrapper", async () => {
    const actions = await loadActions();

    expect(Object.keys(actions).sort()).toEqual(["submitRefundOrderAction"]);
  });
});

describe("submitRefundOrderAction", () => {
  beforeEach(() => {
    state.noSession = false;
    state.result = {status: "refunded"};
    state.calls = [];
    cache.revalidatePath.mockClear();
  });

  // An authorization denial must not be reportable as a normal outcome, and the
  // service must never run for a caller who is not staff.
  it("refuses without a staff session and never reaches the service", async () => {
    state.noSession = true;
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form()),
    ).rejects.toThrow("UNAUTHORIZED");
    expect(state.calls).toHaveLength(0);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("refunds a paid order, reports success and revalidates the event page", async () => {
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form(ORDER_ID, "Duplicate purchase")),
    ).resolves.toEqual({status: "ok", message: MESSAGES.refunded});
    expect(state.calls).toEqual([
      {actor: state.session, input: {orderId: ORDER_ID, note: "Duplicate purchase"}},
    ]);
    expect(cache.revalidatePath.mock.calls).toEqual([[EVENT_PATH]]);
  });

  it("maps already_refunded to its own message", async () => {
    state.result = {status: "already_refunded"};
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form()),
    ).resolves.toEqual({status: "error", message: MESSAGES.already_refunded});
  });

  it("maps not_admissible to its own message", async () => {
    state.result = {status: "not_admissible"};
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form()),
    ).resolves.toEqual({status: "error", message: MESSAGES.not_admissible});
  });

  // The one outcome a staff member must not misread: a provider failure charged
  // nothing back, so the money is still with the buyer and the action retryable.
  it("maps provider_failed to a message that says nothing was charged back", async () => {
    state.result = {status: "provider_failed"};
    const {submitRefundOrderAction} = await loadActions();

    const result = await submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form());

    expect(result).toEqual({status: "error", message: MESSAGES.provider_failed});
    expect(MESSAGES.provider_failed.toLowerCase()).toContain("nothing was charged back");
  });

  it("maps not_found to its own message", async () => {
    state.result = {status: "not_found"};
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form()),
    ).resolves.toEqual({status: "error", message: MESSAGES.not_found});
  });

  it("rejects a malformed order id without reaching the service", async () => {
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, {status: "idle"}, form("not-a-uuid")),
    ).resolves.toEqual({status: "error", message: MESSAGES.not_found});
    expect(state.calls).toHaveLength(0);
  });
});
