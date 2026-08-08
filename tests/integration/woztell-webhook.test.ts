import {createHmac} from "node:crypto";

import {describe, expect, it, vi} from "vitest";

import {
  decideWoztellClaimState,
} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {
  createProductionWoztellWebhookPostHandler,
  createWoztellWebhookPostHandler,
} from "@/lib/api/woztell-webhook-route";

const SECRET = "credential-free-fixture-secret";
const NOW = new Date("2026-07-28T02:00:00.000Z");
const BODY = JSON.stringify({
  from: "+85290000000",
  type: "TEXT",
  messageId: "wamid.fixture.1",
  timestamp: "2026-07-28T01:00:00.000Z",
  data: {text: "Hello"},
});

function signature(rawBody: string) {
  return createHmac("sha256", SECRET).update(rawBody).digest("base64");
}

function request(rawBody: string, suppliedSignature: string | null) {
  const headers = new Headers({"content-type": "application/json"});
  if (suppliedSignature !== null) {
    headers.set("x-woztell-signature", suppliedSignature);
  }
  return new Request("https://www.hkwtia.org/api/webhooks/woztell", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function verifiedChannel() {
  return createWoztellAdapter(
    {WOZTELL_WEBHOOK_SECRET: SECRET},
    vi.fn(),
  );
}

function acceptedClaim(pendingReply?: string) {
  return {
    status: "accepted" as const,
    conversationId: "11111111-1111-4111-8111-111111111111",
    owner: {
      kind: "anonymous" as const,
      anonymousOwnerHash: "a".repeat(64),
    },
    profileId: null,
    locale: "en" as const,
    memberName: "Member",
    whatsappOptIn: true,
    ...(pendingReply === undefined ? {} : {pendingReply}),
  };
}

function conciergeTurn(text = "Welcome") {
  return {
    conversationId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    events: {
      async *[Symbol.asyncIterator]() {
        yield {event: "delta", data: {text}};
        yield {
          event: "done",
          data: {citations: [], escalationId: null},
        };
      },
    },
    cancel: vi.fn(async () => undefined),
  };
}

function processorDependencies(
  overrides: Record<string, unknown> = {},
) {
  return {
    channel: createWoztellAdapter({}, vi.fn()),
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async () => acceptedClaim()),
    markRunOwned: vi.fn(async () => undefined),
    markReplyReady: vi.fn(async () => undefined),
    markCompleted: vi.fn(async () => undefined),
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {startTurn: vi.fn(async () => conciergeTurn())},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
    approvedTemplateKeys: new Set([
      "concierge_follow_up_en" as const,
      "concierge_follow_up_zh_hk" as const,
    ]),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
    ...overrides,
  };
}

describe("WOZTELL webhook route", () => {
  it("verifies the exact raw body before JSON parsing", async () => {
    const process = vi.fn();
    const post = createWoztellWebhookPostHandler({
      channel: verifiedChannel(),
      process,
    });
    const response = await post(request("{not-json", signature(BODY)));
    expect(response.status).toBe(401);
    expect(process).not.toHaveBeenCalled();
  });

  it.each([
    {name: "missing production secret", adapter: createWoztellAdapter({}, vi.fn())},
    {name: "invalid signature", adapter: verifiedChannel()},
  ])("returns 401 for $name", async ({adapter, name}) => {
    const process = vi.fn();
    const post = createWoztellWebhookPostHandler({channel: adapter, process});
    const response = await post(request(
      BODY,
      name === "invalid signature" ? "wrong" : signature(BODY),
    ));
    expect(response.status).toBe(401);
    expect(process).not.toHaveBeenCalled();
  });

  it("returns 202 for an accepted credential-free fixture", async () => {
    const process = vi.fn(async () => ({status: "accepted" as const}));
    const post = createWoztellWebhookPostHandler({
      channel: verifiedChannel(),
      process,
    });
    const response = await post(request(BODY, signature(BODY)));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({status: "accepted"});
    expect(process).toHaveBeenCalledWith(JSON.parse(BODY));
  });

  it("returns deterministic 202 duplicate responses without replaying work", async () => {
    const process = vi.fn(async () => ({status: "duplicate" as const}));
    const post = createWoztellWebhookPostHandler({
      channel: verifiedChannel(),
      process,
    });
    const first = await post(request(BODY, signature(BODY)));
    const retry = await post(request(BODY, signature(BODY)));
    expect(first.status).toBe(202);
    expect(retry.status).toBe(202);
    await expect(retry.json()).resolves.toEqual({status: "duplicate"});
  });

  it("wires durable claim before the shared WhatsApp Concierge and does not replay a completed turn", async () => {
    const order: string[] = [];
    let claimed = false;
    const dependencies = processorDependencies({
      claimInbound: vi.fn(async () => {
        order.push("claim");
        if (claimed) return {status: "duplicate" as const};
        claimed = true;
        return acceptedClaim();
      }),
      concierge: {
        startTurn: vi.fn(async () => {
          order.push("concierge:whatsapp");
          return conciergeTurn();
        }),
      },
    });
    const post = createProductionWoztellWebhookPostHandler({
      channel: verifiedChannel(),
      processorDependencies: dependencies,
    });
    expect((await post(request(BODY, signature(BODY)))).status).toBe(202);
    expect((await post(request(BODY, signature(BODY)))).status).toBe(202);
    expect(order).toEqual(["claim", "concierge:whatsapp", "claim"]);
  });

  it("allows an expired pre-effect claim to resume after a crash", () => {
    expect(decideWoztellClaimState({
      state: "claimed",
      leaseUntil: new Date("2026-07-28T01:59:59.999Z"),
      now: NOW,
    })).toBe("resume");
  });

  it("does not replay a durably completed Concierge run or its messages", () => {
    expect(decideWoztellClaimState({
      state: "completed",
      leaseUntil: null,
      now: NOW,
    })).toBe("duplicate");
  });

  it("keeps a non-expired owned run single-flight", () => {
    expect(decideWoztellClaimState({
      state: "running",
      leaseUntil: new Date("2026-07-28T02:05:00.000Z"),
      now: NOW,
    })).toBe("duplicate");
  });

  it("resumes a persisted reply after outbound failure without a second Concierge run", async () => {
    let pendingReply: string | undefined;
    let completed = false;
    const idempotencyKeys: string[] = [];
    const sendSessionMessage = vi.fn(async (input) => {
      idempotencyKeys.push(input.idempotencyKey);
      if (idempotencyKeys.length === 1) throw new Error("connection_lost");
      return {status: "sent" as const, providerId: "wamid.reply.1"};
    });
    const baseChannel = createWoztellAdapter({}, vi.fn());
    const dependencies = processorDependencies({
      channel: {...baseChannel, sendSessionMessage},
      claimInbound: vi.fn(async () => {
        if (completed) return {status: "duplicate" as const};
        return acceptedClaim(pendingReply);
      }),
      markReplyReady: vi.fn(async (_providerId, reply) => {
        pendingReply = reply;
      }),
      markCompleted: vi.fn(async () => {
        completed = true;
      }),
    });
    const post = createProductionWoztellWebhookPostHandler({
      channel: verifiedChannel(),
      processorDependencies: dependencies,
    });

    await expect(post(request(BODY, signature(BODY))))
      .rejects.toThrow("connection_lost");
    const retry = await post(request(BODY, signature(BODY)));

    expect(retry.status).toBe(202);
    expect(dependencies.concierge.startTurn).toHaveBeenCalledOnce();
    expect(sendSessionMessage).toHaveBeenCalledTimes(2);
    expect(idempotencyKeys).toEqual([
      "concierge:wamid.fixture.1:session",
      "concierge:wamid.fixture.1:session",
    ]);
  });

  it("does not expose or require live WOZTELL credentials in fixtures", () => {
    expect(process.env.RUN_LIVE_WOZTELL).not.toBe("1");
    expect(BODY).not.toContain("WOZTELL_API_TOKEN");
    expect(BODY).not.toContain("WOZTELL_CHANNEL_ID");
  });

  it("loads only app and AI contracts for the production WOZTELL route", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "CONCIERGE_COOKIE_SECRET",
      "concierge-cookie-secret-that-is-at-least-32-bytes",
    );
    vi.stubEnv("APP_URL", "https://www.hkwtia.org");

    const createProductionWoztellProcessorDependencies = vi.fn(() =>
      processorDependencies(),
    );
    const withDurableWoztellReplyState = vi.fn((input) => input);
    const createWoztellAdapterMock = vi.fn(() => verifiedChannel());

    vi.doMock("@/lib/ai/woztell-production", () => ({
      createProductionWoztellProcessorDependencies,
    }));
    vi.doMock("@/lib/ai/woztell-reply-state", () => ({
      withDurableWoztellReplyState,
    }));
    vi.doMock("@/lib/channels/woztell", async () => {
      const actual = await vi.importActual<typeof import("@/lib/channels/woztell")>(
        "@/lib/channels/woztell",
      );
      return {
        ...actual,
        createWoztellAdapter: createWoztellAdapterMock,
      };
    });

    const route = await import("@/app/api/webhooks/woztell/route");
    const response = await route.POST(request(BODY, signature(BODY)));

    expect(response.status).toBe(202);
    expect(createWoztellAdapterMock).toHaveBeenCalledOnce();
    expect(createProductionWoztellProcessorDependencies).toHaveBeenCalledOnce();
    expect(withDurableWoztellReplyState).toHaveBeenCalledOnce();
  });
});
