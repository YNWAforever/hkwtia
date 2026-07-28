import {describe, expect, it, vi} from "vitest";

import {createAnonymousOwnership} from "@/lib/ai/conversation-cookie";
import {
  createConciergePostHandler,
  encodeSseEvent,
} from "@/app/api/ai/concierge/route";
import {
  createFeedbackPostHandler,
} from "@/app/api/ai/conversations/[id]/feedback/route";

const SECRET = "concierge-cookie-secret-that-is-at-least-32-bytes";
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.hkwtia.org/api/ai/concierge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.hkwtia.org",
      "x-vercel-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function routeDependencies(overrides: Record<string, unknown> = {}) {
  return {
    expectedOrigin: "https://www.hkwtia.org",
    cookieSecret: SECRET,
    rateLimiter: {check: vi.fn(() => ({
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
    }))},
    verifyTurnstile: vi.fn(async () => true),
    getActor: vi.fn(async () => null),
    createAnonymousOwnership: vi.fn(() =>
      createAnonymousOwnership(SECRET, () => Buffer.alloc(32, 4))),
    service: {
      startTurn: vi.fn(async ({owner}: {owner: unknown}) => ({
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
        owner,
        events: {
          async *[Symbol.asyncIterator]() {
            yield {
              event: "meta",
              data: {conversationId: CONVERSATION_ID, runId: RUN_ID},
            } as const;
            yield {event: "delta", data: {text: "Hello"}} as const;
            yield {
              event: "done",
              data: {citations: [], escalationId: null},
            } as const;
          },
        },
        cancel: vi.fn(async () => undefined),
      })),
    },
    ...overrides,
  };
}

describe("Concierge SSE route", () => {
  it("emits the custom SSE protocol and a token-only anonymous cookie", async () => {
    const response = await createConciergePostHandler(
      routeDependencies(),
    )(request({message: "Hello", locale: "en"}));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("set-cookie")).toMatch(
      /^hkwtia_concierge_owner=[A-Za-z0-9_-]+;/,
    );
    expect(await response.text()).toBe([
      encodeSseEvent({
        event: "meta",
        data: {conversationId: CONVERSATION_ID, runId: RUN_ID},
      }),
      encodeSseEvent({event: "delta", data: {text: "Hello"}}),
      encodeSseEvent({
        event: "done",
        data: {citations: [], escalationId: null},
      }),
    ].join(""));
  });

  it("rejects origin spoofing, honeypot submissions, Turnstile failure, and the 21st request", async () => {
    const origin = await createConciergePostHandler(routeDependencies())(
      request({message: "Hello", locale: "en"}, {
        origin: "https://www.hkwtia.org.attacker.test",
      }),
    );
    expect(origin.status).toBe(403);

    const honeypot = await createConciergePostHandler(routeDependencies())(
      request({message: "Hello", locale: "en", website: "spam"}),
    );
    expect(honeypot.status).toBe(400);

    const turnstile = await createConciergePostHandler(routeDependencies({
      verifyTurnstile: vi.fn(async () => false),
    }))(request({message: "Hello", locale: "en", turnstileToken: "bad"}));
    expect(turnstile.status).toBe(403);

    const limited = await createConciergePostHandler(routeDependencies({
      rateLimiter: {check: vi.fn(() => ({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 42,
      }))},
    }))(request({message: "Hello", locale: "en"}));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
  });

  it("continues only the authenticated member's owned conversation", async () => {
    const service = {
      startTurn: vi.fn(async (input: {owner: unknown}) => ({
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
        owner: input.owner,
        events: {async *[Symbol.asyncIterator]() {}},
        cancel: vi.fn(),
      })),
    };
    const handler = createConciergePostHandler(routeDependencies({
      getActor: vi.fn(async () => ({profileId: "profile-1"})),
      service,
    }));

    await handler(request({
      conversationId: CONVERSATION_ID,
      message: "Continue",
      locale: "en",
    }, {cookie: "hkwtia_concierge_owner=attacker-token"}));

    expect(service.startTurn).toHaveBeenCalledWith(expect.objectContaining({
      owner: {kind: "profile", profileId: "profile-1"},
      profileId: "profile-1",
      conversationId: CONVERSATION_ID,
    }));
  });

  it("returns a real 404 for cross-owner conversation access", async () => {
    const error = Object.assign(new Error("FORBIDDEN"), {code: "FORBIDDEN"});
    const response = await createConciergePostHandler(routeDependencies({
      service: {startTurn: vi.fn(async () => { throw error; })},
    }))(request({
      conversationId: CONVERSATION_ID,
      message: "Steal",
      locale: "en",
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "CONVERSATION_NOT_FOUND",
    });
  });
});

describe("owned Concierge feedback route", () => {
  it("accepts score 1..5 only once for the owned run", async () => {
    const recordFeedback = vi.fn(async () => ({id: RUN_ID, csatScore: 5}));
    const handler = createFeedbackPostHandler({
      expectedOrigin: "https://www.hkwtia.org",
      cookieSecret: SECRET,
      getActor: vi.fn(async () => ({profileId: "profile-1"})),
      recordFeedback,
    });
    const feedbackRequest = new Request(
      `https://www.hkwtia.org/api/ai/conversations/${RUN_ID}/feedback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://www.hkwtia.org",
        },
        body: JSON.stringify({score: 5}),
      },
    );

    const response = await handler(feedbackRequest, {
      params: Promise.resolve({id: RUN_ID}),
    });
    expect(response.status).toBe(200);
    expect(recordFeedback).toHaveBeenCalledWith(
      {kind: "profile", profileId: "profile-1"},
      RUN_ID,
      5,
    );
  });

  it.each([0, 6, 2.5])("rejects invalid CSAT score %s", async (score) => {
    const handler = createFeedbackPostHandler({
      expectedOrigin: "https://www.hkwtia.org",
      cookieSecret: SECRET,
      getActor: vi.fn(async () => ({profileId: "profile-1"})),
      recordFeedback: vi.fn(),
    });
    const response = await handler(new Request(
      `https://www.hkwtia.org/api/ai/conversations/${RUN_ID}/feedback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://www.hkwtia.org",
        },
        body: JSON.stringify({score}),
      },
    ), {params: Promise.resolve({id: RUN_ID})});

    expect(response.status).toBe(400);
  });

  it("denies anonymous cookie tampering and cross-owner feedback as 404", async () => {
    const created = createAnonymousOwnership(
      SECRET,
      () => Buffer.alloc(32, 5),
    );
    const recordFeedback = vi.fn(async () => {
      throw Object.assign(new Error("FORBIDDEN"), {code: "FORBIDDEN"});
    });
    const handler = createFeedbackPostHandler({
      expectedOrigin: "https://www.hkwtia.org",
      cookieSecret: SECRET,
      getActor: vi.fn(async () => null),
      recordFeedback,
    });
    const response = await handler(new Request(
      `https://www.hkwtia.org/api/ai/conversations/${RUN_ID}/feedback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://www.hkwtia.org",
          cookie: `hkwtia_concierge_owner=${created.token.slice(0, -1)}A`,
        },
        body: JSON.stringify({score: 4}),
      },
    ), {params: Promise.resolve({id: RUN_ID})});

    expect(response.status).toBe(404);
    expect(recordFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "anonymous",
        anonymousOwnerHash: expect.not.stringMatching(created.ownerHash),
      }),
      RUN_ID,
      4,
    );
  });
});
