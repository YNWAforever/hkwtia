import {describe, expect, it, vi} from "vitest";

import {DeliveryFailure} from "@/lib/email/transport";
import {eventCancellationNoticesEnabled, runEventCancellationNotifications} from "@/lib/jobs/event-notification-runner";
import type {CancellationNoticeClaim} from "@/lib/db/repos/event-notifications";

const claim: CancellationNoticeClaim = {
  id: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  registrationKind: "guest", registrationId: "33333333-3333-4333-8333-333333333333",
  recipientName: "Guest", recipientEmail: "guest@example.test", recipientLocale: "zh-HK",
  idempotencyKey: "event-cancel:test:guest:email", attemptCount: 1, payload: null,
};

function harness(send: (payload: unknown) => Promise<{status: "sent"; providerId: string}>) {
  const settled: Array<{status: string; result: string}> = [];
  const frozen: unknown[] = [];
  const renders: unknown[] = [];
  const outbox = {
    expandPending: vi.fn(async () => ({queued: 1, blocked: 0})),
    claimDue: vi.fn(async () => [claim]),
    knownBlock: vi.fn(async () => null),
    eventSummary: vi.fn(async () => ({titleEn: "AI Clinic", titleZh: "人工智能診所", slug: "ai-clinic"})),
    freezePayload: vi.fn(async (_actor: unknown, _claim: unknown, payload: unknown) => {frozen.push(payload); return true;}),
    settle: vi.fn(async (_actor: unknown, _claim: unknown, status: string, _now: unknown, result: string) => {settled.push({status, result}); return true;}),
  };
  const deps = {
    outbox,
    transport: {send},
    renderEmail: async (input: unknown) => {renders.push(input); return {subject: "Cancelled", html: "<p>Cancelled</p>", text: "Cancelled", headers: {}};},
    emailFrom: "WTIA <events@example.test>", appUrl: "https://preview.example.test",
  };
  return {deps, outbox, settled, frozen, renders};
}

describe("durable RSVP cancellation notifications", () => {
  it("defaults off and rejects malformed enablement values", () => {
    expect(eventCancellationNoticesEnabled(undefined)).toBe(false);
    expect(eventCancellationNoticesEnabled("false")).toBe(false);
    expect(eventCancellationNoticesEnabled("true")).toBe(true);
    expect(() => eventCancellationNoticesEnabled("1")).toThrow("INVALID_EVENT_CANCELLATION_NOTICES_FLAG");
  });

  it("freezes a localized service email and records provider acceptance, not delivery", async () => {
    const sends: unknown[] = [];
    const {deps, settled, frozen, renders} = harness(async (payload) => {sends.push(payload); return {status: "sent", providerId: "provider-1"};});
    const result = await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(result).toEqual({expanded: 1, accepted: 1, blocked: 0, failed: 0, retrying: 0, uncertain: 0});
    expect(renders).toContainEqual(expect.objectContaining({template: "event_rsvp_cancelled", locale: "zh-HK", classification: "transactional", variables: {eventTitle: "人工智能診所", ctaUrl: "https://preview.example.test/zh/events/ai-clinic"}}));
    expect(frozen).toEqual(sends);
    expect(sends).toContainEqual(expect.objectContaining({idempotencyKey: claim.idempotencyKey, to: claim.recipientEmail}));
    expect(settled).toEqual([{status: "accepted", result: "provider-1"}]);
  });

  it("retries a provider network failure with the same frozen key", async () => {
    const {deps, settled, frozen} = harness(async () => {throw new DeliveryFailure("retryable_network");});
    await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(frozen).toHaveLength(1);
    expect(settled).toEqual([{status: "queued", result: "retryable_network"}]);
  });

  it("records a definitive provider refusal as failed, separate from pre-send blocking", async () => {
    const {deps, settled} = harness(async () => {throw new DeliveryFailure("provider_client_error");});
    await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(settled).toEqual([{status: "failed", result: "provider_client_error"}]);
  });

  it("holds unknown provider acceptance for reconciliation", async () => {
    const {deps, settled} = harness(async () => {throw new DeliveryFailure("provider_unclassified_failure");});
    await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(settled).toEqual([{status: "uncertain", result: "provider_unclassified_failure"}]);
  });

  it("retries a transient pre-send eligibility read failure", async () => {
    const send = vi.fn(async () => ({status: "sent" as const, providerId: "provider-1"}));
    const {deps, outbox, settled} = harness(send);
    outbox.knownBlock.mockRejectedValueOnce(new Error("database unavailable"));
    await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(send).not.toHaveBeenCalled();
    expect(settled).toEqual([{status: "queued", result: "pre_send_failure"}]);
  });

  it("does not turn a known provider acceptance into an unknown delivery when persistence fails", async () => {
    const send = vi.fn(async () => ({status: "sent" as const, providerId: "provider-1"}));
    const {deps, outbox} = harness(send);
    outbox.settle.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps)).rejects.toThrow("database unavailable");
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.settle).toHaveBeenCalledTimes(1);
  });

  it("reuses the frozen payload and key after an abandoned send claim", async () => {
    const frozenPayload = {to: claim.recipientEmail, from: "WTIA <events@example.test>", subject: "Cancelled", html: "<p>Cancelled</p>", text: "Cancelled", headers: {}, idempotencyKey: claim.idempotencyKey};
    const sends: unknown[] = [];
    const {deps, outbox, renders, frozen} = harness(async (payload) => {sends.push(payload); return {status: "sent", providerId: "provider-2"};});
    outbox.claimDue.mockResolvedValueOnce([{...claim, attemptCount: 2, payload: frozenPayload}] as never);
    await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(renders).toHaveLength(0);
    expect(frozen).toHaveLength(0);
    expect(sends).toEqual([frozenPayload]);
  });

  it("retries a timed-out provider call under the same frozen key", async () => {
    vi.useFakeTimers();
    try {
      const {deps, settled, frozen} = harness(async () => new Promise<never>(() => {}));
      const running = runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
      await vi.advanceTimersByTimeAsync(6_000);
      expect(await running).toMatchObject({retrying: 1});
      expect(frozen).toHaveLength(1);
      expect(settled).toEqual([{status: "queued", result: "retryable_network"}]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks known addresses before rendering or sending", async () => {
    const send = vi.fn(async () => ({status: "sent" as const, providerId: "provider-1"}));
    const {deps, outbox, settled, renders} = harness(send);
    outbox.knownBlock.mockResolvedValueOnce("hard_bounce" as never);
    await runEventCancellationNotifications(new Date("2026-09-27T00:00:00Z"), deps);
    expect(renders).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(settled).toEqual([{status: "blocked", result: "hard_bounce"}]);
  });
});
