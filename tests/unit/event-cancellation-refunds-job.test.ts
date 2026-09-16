import {describe, expect, it, vi} from "vitest";

import {runEventCancellationRefunds, type EventCancellationRefundDependencies} from "@/lib/jobs/event-cancellation-refunds";

const now = new Date("2026-09-16T04:00:00Z");

function harness(overrides: Partial<EventCancellationRefundDependencies> = {}) {
  const orders = [
    {orderId: "cancelled-paid-1", eventId: "ev-cancelled"},
    {orderId: "cancelled-paid-2", eventId: "ev-cancelled"},
  ];
  const refundOrder = vi.fn(async (_actor, input: {orderId: string}) =>
    input.orderId === "cancelled-paid-2" ? {status: "provider_failed" as const} : {status: "refunded" as const});
  return {
    dependencies: {
      listOrders: vi.fn(async () => orders),
      refundOrder,
      ...overrides,
    },
    refundOrder,
  };
}

describe("the event-cancellation refund sweep", () => {
  it("refunds every still-paid order it is given, and reports what happened", async () => {
    const {dependencies, refundOrder} = harness();
    const result = await runEventCancellationRefunds(now, dependencies);
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({scanned: 2, refunded: 1, failed: 1});
  });

  it("refunds as the system actor, so the audit cannot name a person", async () => {
    const {dependencies, refundOrder} = harness();
    await runEventCancellationRefunds(now, dependencies);
    const [actor] = refundOrder.mock.calls[0]!;
    expect(actor).toEqual({kind: "system", userId: null, source: "event-cancellation"});
  });

  it("leaves a provider failure for the next run rather than recording a refund", async () => {
    const {dependencies, refundOrder} = harness();
    await runEventCancellationRefunds(now, dependencies);
    // The sweep reports it and moves on: nothing here may throw, or one bad
    // order would stop the whole batch.
    expect(refundOrder).toHaveBeenCalledTimes(2);
  });

  it("continues the batch and counts a commit failure as failed", async () => {
    const listOrders = vi.fn(async () => [
      {orderId: "commit-failed", eventId: "ev-cancelled"},
      {orderId: "refunded-ok", eventId: "ev-cancelled"},
    ]);
    const refundOrder = vi.fn(async (_actor, input: {orderId: string}) =>
      input.orderId === "commit-failed" ? {status: "commit_failed" as const} : {status: "refunded" as const});
    const result = await runEventCancellationRefunds(now, {listOrders, refundOrder});
    // A commit failure is counted, not thrown: the order stays `paid` for the
    // next run, and the order behind it must still be attempted.
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({scanned: 2, refunded: 1, failed: 1});
  });

  it("bounds the batch, so one run cannot walk an unbounded backlog", async () => {
    const listOrders = vi.fn(async () => []);
    await runEventCancellationRefunds(now, {listOrders, refundOrder: vi.fn()});
    expect(listOrders).toHaveBeenCalledWith(100);
  });

  it("counts an already-refunded order without calling it a failure", async () => {
    const {dependencies} = harness({refundOrder: vi.fn(async () => ({status: "already_refunded" as const}))});
    const result = await runEventCancellationRefunds(now, dependencies);
    expect(result).toMatchObject({refunded: 0, alreadyRefunded: 2, failed: 0});
  });
});
