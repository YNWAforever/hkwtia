import {beforeEach, describe, expect, it, vi} from "vitest";

import type {RefundOutcomeMessages} from "@/lib/tickets/refund-actions";
import zhHk from "@/messages/zh-HK.json";

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

// Each slot is distinct, which is what makes the branch-selection assertions
// exact rather than nominal.
const MESSAGES: RefundOutcomeMessages = {
  refunded: "Refunded.",
  alreadyRefunded: "This order was already refunded.",
  notAdmissible: "This order is not payable, so there is nothing to refund.",
  providerFailed: "The refund did not go through, so nothing was charged back. You can try again.",
  commitFailed: "The provider may have refunded this order, but we could not record it. Check the provider before retrying.",
  notFound: "That order could not be found.",
};

// The real zh-HK copy the page binds. The action reads these from its argument,
// so a regression to a hard-coded English literal cannot satisfy this set.
const ZH_MESSAGES: RefundOutcomeMessages = {
  refunded: zhHk.Admin.eventsMgmt.orders.refundOutcomes.refunded,
  alreadyRefunded: zhHk.Admin.eventsMgmt.orders.refundOutcomes.alreadyRefunded,
  notAdmissible: zhHk.Admin.eventsMgmt.orders.refundOutcomes.notAdmissible,
  providerFailed: zhHk.Admin.eventsMgmt.orders.refundOutcomes.providerFailed,
  commitFailed: zhHk.Admin.eventsMgmt.orders.refundOutcomes.commitFailed,
  notFound: zhHk.Admin.eventsMgmt.orders.refundOutcomes.notFound,
};

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
      submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form()),
    ).rejects.toThrow("UNAUTHORIZED");
    expect(state.calls).toHaveLength(0);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("refunds a paid order, reports success and revalidates the event page", async () => {
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form(ORDER_ID, "Duplicate purchase")),
    ).resolves.toEqual({status: "ok", message: MESSAGES.refunded});
    expect(state.calls).toEqual([
      {actor: state.session, input: {orderId: ORDER_ID, note: "Duplicate purchase"}},
    ]);
    expect(cache.revalidatePath.mock.calls).toEqual([[EVENT_PATH]]);
  });

  // The whole point of the bound message set: a zh-HK staff member must not be
  // shown English for the one outcome where "the money did not move" matters.
  it("reports the outcome in the locale whose message set the page bound", async () => {
    state.result = {status: "provider_failed"};
    const {submitRefundOrderAction} = await loadActions();

    const result = await submitRefundOrderAction(EVENT_PATH, ZH_MESSAGES, {status: "idle"}, form());

    expect(result).toEqual({status: "error", message: ZH_MESSAGES.providerFailed});
    expect(result).not.toEqual({status: "error", message: MESSAGES.providerFailed});
  });

  it("maps already_refunded to its own message and refreshes a possibly stale row", async () => {
    state.result = {status: "already_refunded"};
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form()),
    ).resolves.toEqual({status: "error", message: MESSAGES.alreadyRefunded});
    expect(cache.revalidatePath.mock.calls).toEqual([[EVENT_PATH]]);
  });

  it("maps not_admissible to its own message without revalidating", async () => {
    state.result = {status: "not_admissible"};
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form()),
    ).resolves.toEqual({status: "error", message: MESSAGES.notAdmissible});
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  // The one outcome a staff member must not misread: a provider failure charged
  // nothing back, so the money is still with the buyer and the action retryable.
  it("maps provider_failed to a message that says nothing was charged back, without revalidating", async () => {
    state.result = {status: "provider_failed"};
    const {submitRefundOrderAction} = await loadActions();

    const result = await submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form());

    expect(result).toEqual({status: "error", message: MESSAGES.providerFailed});
    expect(MESSAGES.providerFailed.toLowerCase()).toContain("nothing was charged back");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  // The provider may have moved the money while the order is unrecorded: the
  // message must say so, in the bound locale, and the page must not revalidate
  // as though a refund had been committed.
  it("maps commit_failed to a message that says the provider may have refunded, in the bound locale", async () => {
    state.result = {status: "commit_failed"};
    const {submitRefundOrderAction} = await loadActions();

    const result = await submitRefundOrderAction(EVENT_PATH, ZH_MESSAGES, {status: "idle"}, form());

    expect(result).toEqual({status: "error", message: ZH_MESSAGES.commitFailed});
    expect(result).not.toEqual({status: "error", message: MESSAGES.commitFailed});
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps not_found to its own message without revalidating", async () => {
    state.result = {status: "not_found"};
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form()),
    ).resolves.toEqual({status: "error", message: MESSAGES.notFound});
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed order id without reaching the service", async () => {
    const {submitRefundOrderAction} = await loadActions();

    await expect(
      submitRefundOrderAction(EVENT_PATH, ZH_MESSAGES, {status: "idle"}, form("not-a-uuid")),
    ).resolves.toEqual({status: "error", message: ZH_MESSAGES.notFound});
    expect(state.calls).toHaveLength(0);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  // An untouched note input submits `""`; the audit metadata means "no note".
  it.each([
    ["an empty note", ""],
    ["a whitespace-only note", "   "],
  ])("normalises %s to no note at all", async (_label, note) => {
    const {submitRefundOrderAction} = await loadActions();

    await submitRefundOrderAction(EVENT_PATH, MESSAGES, {status: "idle"}, form(ORDER_ID, note));

    expect(state.calls).toEqual([{actor: state.session, input: {orderId: ORDER_ID}}]);
  });
});
