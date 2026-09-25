import {describe, expect, it, vi} from "vitest";

import {runEventCancellationRefunds, type EventCancellationRefundDependencies} from "@/lib/jobs/event-cancellation-refunds";

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
      deferFailedOrder: vi.fn(async () => undefined),
      ...overrides,
    },
    refundOrder,
  };
}

describe("the event-cancellation refund sweep", () => {
  it("refunds every still-paid order it is given, and reports what happened", async () => {
    const {dependencies, refundOrder} = harness();
    await expect(runEventCancellationRefunds(dependencies)).rejects.toMatchObject({
      summary: {scanned: 2, refunded: 1, failed: 1, notAdmissible: 0, notFound: 0},
    });
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(dependencies.deferFailedOrder).toHaveBeenCalledWith("cancelled-paid-2");
  });

  it("refunds as the system actor, so the audit cannot name a person", async () => {
    const {dependencies, refundOrder} = harness();
    await expect(runEventCancellationRefunds(dependencies)).rejects.toMatchObject({summary: {failed: 1}});
    const [actor] = refundOrder.mock.calls[0]!;
    expect(actor).toEqual({kind: "system", userId: null, source: "event-cancellation"});
  });

  it("leaves a provider failure for the next run rather than recording a refund", async () => {
    const {dependencies, refundOrder} = harness();
    await expect(runEventCancellationRefunds(dependencies)).rejects.toMatchObject({summary: {failed: 1}});
    // The batch still advances, but the job must fail so the Worker alerts.
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(dependencies.deferFailedOrder).toHaveBeenCalledWith("cancelled-paid-2");
  });

  it("continues the batch and counts a commit failure as failed", async () => {
    const listOrders = vi.fn(async () => [
      {orderId: "commit-failed", eventId: "ev-cancelled"},
      {orderId: "refunded-ok", eventId: "ev-cancelled"},
    ]);
    const refundOrder = vi.fn(async (_actor, input: {orderId: string}) =>
      input.orderId === "commit-failed" ? {status: "commit_failed" as const} : {status: "refunded" as const});
    const deferFailedOrder = vi.fn(async () => undefined);
    await expect(runEventCancellationRefunds({listOrders, refundOrder, deferFailedOrder}))
      .rejects.toMatchObject({summary: {scanned: 2, refunded: 1, failed: 1, commitFailed: 1}});
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(deferFailedOrder).toHaveBeenCalledWith("commit-failed");
  });

  it("reports a pending provider refund without alerting as a failure", async () => {
    const {dependencies} = harness({refundOrder: vi.fn(async () => ({status: "pending" as const}))});
    await expect(runEventCancellationRefunds(dependencies)).resolves.toMatchObject({scanned: 2, pending: 2, failed: 0});
    expect(dependencies.deferFailedOrder).not.toHaveBeenCalled();
  });

  it("bounds the batch, so one run cannot walk an unbounded backlog", async () => {
    const listOrders = vi.fn(async () => []);
    await runEventCancellationRefunds({listOrders, deferFailedOrder: vi.fn(), refundOrder: vi.fn()});
    expect(listOrders).toHaveBeenCalledWith(100);
  });

  it("counts an already-refunded order without calling it a failure", async () => {
    const {dependencies} = harness({refundOrder: vi.fn(async () => ({status: "already_refunded" as const}))});
    const result = await runEventCancellationRefunds(dependencies);
    expect(result).toMatchObject({refunded: 0, alreadyRefunded: 2, failed: 0});
  });

  // The whole-branch finding: `not_found` was counted nowhere and
  // `not_admissible` was folded into `failed`, so a run's buckets did not add up
  // to what it scanned. Every outcome now has a home, and this drives all six.
  it("reconciles every bucket back to the number of orders scanned", async () => {
    const listOrders = vi.fn(async () => [
      {orderId: "refunded", eventId: "ev"},
      {orderId: "already", eventId: "ev"},
      {orderId: "provider", eventId: "ev"},
      {orderId: "commit", eventId: "ev"},
      {orderId: "inadmissible", eventId: "ev"},
      {orderId: "gone", eventId: "ev"},
    ]);
    const byOrder: Readonly<Record<string, {status: "refunded" | "already_refunded" | "provider_failed" | "commit_failed" | "not_admissible" | "not_found"}>> = {
      refunded: {status: "refunded"},
      already: {status: "already_refunded"},
      provider: {status: "provider_failed"},
      commit: {status: "commit_failed"},
      inadmissible: {status: "not_admissible"},
      gone: {status: "not_found"},
    };
    const refundOrder = vi.fn(async (_actor, input: {orderId: string}) => byOrder[input.orderId]!);

    const deferFailedOrder = vi.fn(async () => undefined);
    let summary: Record<string, number> | undefined;
    try {
      await runEventCancellationRefunds({listOrders, refundOrder, deferFailedOrder});
    } catch (error) {
      summary = (error as {summary: Record<string, number>}).summary;
    }

    expect(summary).toEqual({scanned: 6, refunded: 1, alreadyRefunded: 1, pending: 0, failed: 2, commitFailed: 1, notAdmissible: 1, notFound: 1});
    const {scanned, refunded, alreadyRefunded, failed, notAdmissible, notFound} = summary!;
    expect(refunded + alreadyRefunded + failed + notAdmissible + notFound).toBe(scanned);
    expect(deferFailedOrder).toHaveBeenCalledTimes(2);
  });
});
