import {describe, expect, it, vi} from "vitest";

import {DeliveryFailure} from "@/lib/email/transport";
import type {ShowcaseLeadEmailPayload} from "@/lib/db/server-schema";
import {
  deliverLeadEmailForLead,
  drainLeadEmailOutbox,
  type LeadEmailRunnerDependencies,
} from "@/lib/showcase/lead-email-runner";

const ack = {
  id: "11111111-1111-4111-8111-111111111111",
  leadId: "22222222-2222-4222-8222-222222222222",
  kind: "ack" as const,
  idempotencyKey: "showcase-lead:stable:ack",
  attemptCount: 1,
  payload: null,
};
const staff = {
  ...ack,
  id: "33333333-3333-4333-8333-333333333333",
  kind: "staff" as const,
  idempotencyKey: "showcase-lead:stable:staff",
};

function setup() {
  const state = new Map([ack, staff].map((row) => [row.id, {status: "queued", payload: null as null | ShowcaseLeadEmailPayload, attemptCount: 0, row}]));
  const sent: unknown[] = [];
  let failOnce = true;
  const outbox = {
    claimForLead: vi.fn(async () => claim()),
    claimDue: vi.fn(async () => claim()),
    loadContext: vi.fn(async () => ({
      contactName: "Ada", email: "ada@example.com", locale: "en" as const,
      listingSlug: "harbour-vision-ai", listingNameEn: "Harbour Vision AI",
    })),
    freezePayload: vi.fn(async (_actor, id: string, attempt: number, payload: ShowcaseLeadEmailPayload) => {
      const item = state.get(id)!;
      if (item.status !== "sending" || item.attemptCount !== attempt || item.payload) return false;
      item.payload = structuredClone(payload);
      return true;
    }),
    markSent: vi.fn(async (_actor, id: string, attempt: number) => {
      const item = state.get(id)!;
      if (item.status !== "sending" || item.attemptCount !== attempt) return false;
      item.status = "sent";
      return true;
    }),
    markRetryable: vi.fn(async (_actor, id: string, attempt: number) => {
      const item = state.get(id)!;
      if (item.status !== "sending" || item.attemptCount !== attempt) return false;
      item.status = "queued";
      return true;
    }),
    markBlocked: vi.fn(async (_actor, id: string, attempt: number) => {
      const item = state.get(id)!;
      if (item.status !== "sending" || item.attemptCount !== attempt) return false;
      item.status = "blocked";
      return true;
    }),
  };
  function claim() {
    return [...state.values()].filter((item) => item.status === "queued").map((item) => {
      item.status = "sending";
      item.attemptCount += 1;
      return {...item.row, attemptCount: item.attemptCount, payload: item.payload};
    });
  }
  const dependencies = {
    outbox,
    renderEmail: vi.fn(async ({template}) => ({
      subject: template, html: "<p>Notice</p>", text: "Notice", headers: {},
    })),
    transport: {
      send: vi.fn(async (input) => {
        sent.push(structuredClone(input));
        if (input.idempotencyKey.endsWith(":ack") && failOnce) {
          failOnce = false;
          throw new DeliveryFailure("retryable_network");
        }
        return {status: "sent" as const, providerId: "provider-id"};
      }),
    },
    resolveStaffRecipient: vi.fn(async () => "staff@example.com"),
    emailFrom: "WTIA <notice@example.com>",
    appUrl: "https://hkwtia.example",
  } satisfies LeadEmailRunnerDependencies;
  return {dependencies, state, sent};
}

describe("showcase lead email recovery", () => {
  it("releases a stalled provider call before the worker's request deadline", async () => {
    const {dependencies, state} = setup();
    dependencies.transport.send = vi.fn(async () => new Promise<never>(() => {}));
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
    let finished = false;
    try {
      const delivery = deliverLeadEmailForLead(
        ack.leadId, dependencies, new Date("2026-09-26T00:00:00Z"),
      ).then(() => { finished = true; });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(finished).toBe(true);
      await delivery;
      expect(state.get(ack.id)?.status).toBe("queued");
      expect(state.get(staff.id)?.status).toBe("queued");
    } finally {
      vi.useRealTimers();
    }
  });
  it("escalates a definitive provider client refusal without retrying it", async () => {
    const {dependencies, state} = setup();
    dependencies.transport.send = vi.fn(async (input) => {
      if (input.idempotencyKey === ack.idempotencyKey) {
        throw new DeliveryFailure("provider_client_error");
      }
      return {status: "sent" as const, providerId: "staff-id"};
    });
    await deliverLeadEmailForLead(
      ack.leadId, dependencies, new Date("2026-09-26T00:00:00Z"),
    );
    expect(state.get(ack.id)?.status).toBe("blocked");
    expect(state.get(staff.id)?.status).toBe("sent");
    expect(dependencies.outbox.markBlocked).toHaveBeenCalledWith(
      expect.anything(), ack.id, 1, expect.any(Date), "provider_client_error",
    );
    expect(dependencies.outbox.markRetryable).not.toHaveBeenCalled();
  });
  it("claims a batch small enough for three bounded sequential provider calls", async () => {
    const {dependencies} = setup();
    await drainLeadEmailOutbox(new Date("2026-09-26T00:00:00Z"), dependencies);
    expect(dependencies.outbox.claimDue).toHaveBeenCalledWith(
      expect.anything(), expect.any(Date), 3,
    );
  });
  it("retries a failed acknowledgement with the exact frozen provider payload and leaves a settled staff notice alone", async () => {
    const {dependencies, state, sent} = setup();
    await deliverLeadEmailForLead(ack.leadId, dependencies, new Date("2026-09-26T00:00:00Z"));
    expect(state.get(ack.id)?.status).toBe("queued");
    expect(state.get(staff.id)?.status).toBe("sent");
    expect(sent).toHaveLength(2);
    await drainLeadEmailOutbox(new Date("2026-09-26T00:10:00Z"), dependencies);
    expect(state.get(ack.id)?.status).toBe("sent");
    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual(sent[0]);
    expect(dependencies.renderEmail).toHaveBeenCalledTimes(2);
    await drainLeadEmailOutbox(new Date("2026-09-26T00:20:00Z"), dependencies);
    expect(sent).toHaveLength(3);
  });
});
