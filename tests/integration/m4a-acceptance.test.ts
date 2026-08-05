import {createHmac} from "node:crypto";

import {describe, expect, it, vi} from "vitest";
import {Pool} from "pg";

import {
  createProductionWoztellWebhookPostHandler,
  createWoztellWebhookPostHandler,
} from "@/lib/api/woztell-webhook-route";
import {createConciergeService} from "@/lib/ai/agents/concierge";
import {createAgentRuntime} from "@/lib/ai/runtime";
import type {WoztellWebhookProcessorDependencies} from "@/lib/ai/woztell-webhook";
import type {ChannelAdapter} from "@/lib/channels/types";
import {runChatRetention} from "@/lib/ai/retention";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {executeOfflineCase} from "@/evals/runtime-harness";

const NOW = new Date("2026-07-28T04:00:00.000Z");
const CONVERSATION_ID = "41111111-1111-4111-8111-111111111111";
const RUN_ID = "42222222-2222-4222-8222-222222222222";
const PROFILE_ID = "m4a-acceptance-member";

async function drain(
  turn: Awaited<ReturnType<
    ReturnType<typeof createConciergeService>["startTurn"]
  >>,
) {
  const events: unknown[] = [];
  for await (const event of turn.events) events.push(event);
  return events;
}

async function drainText(
  turn: Awaited<ReturnType<
    ReturnType<typeof createConciergeService>["startTurn"]
  >>,
): Promise<string> {
  let text = "";
  for await (const event of turn.events) {
    if (event.event === "delta") text += event.data.text;
  }
  return text;
}

describe("M4A deterministic acceptance", () => {
  it("keeps the kill switch provider-free and records a leave-message task", async () => {
    const provider = vi.fn();
    const embedding = vi.fn();
    const tools = vi.fn();
    const tasks: Array<Record<string, unknown>> = [];
    const run: Record<string, unknown> = {};
    const runtime = createAgentRuntime({
      agentRuns: {
        async start() {},
        async configureModel() {},
        async finish() {},
        async fail() {},
        async escalate() {},
        async disable(_actor, input) {
          Object.assign(run, input, {status: "disabled"});
        },
      },
      providerFactories: {
        openai: () => ({stream: provider}),
        anthropic: () => ({stream: provider}),
      },
      createRunId: () => RUN_ID,
      now: () => NOW,
    });
    const service = createConciergeService({
      agentsEnabled: false,
      model: "openai:gpt-4.1-mini",
      credentials: {openaiApiKey: "must-not-be-used"},
      appOrigin: "https://www.hkwtia.org",
      conversations: {
        async create() {
          return {id: CONVERSATION_ID, locale: "en" as const};
        },
        async getOwned() {
          return {id: CONVERSATION_ID, locale: "en" as const};
        },
        async appendMessage() {
          return {id: "message-1"};
        },
        async startAgentTurn() {
          return {id: RUN_ID};
        },
        async listMessages() {
          return [];
        },
      },
      agentTools: {
        async createStaffTask(_actor, input) {
          const task = {id: "task-leave-message", status: "open" as const, ...input};
          tasks.push(task);
          return task;
        },
      },
      getRuntime: () => runtime,
      getEmbedding: embedding,
      createTools: tools,
      async audit() {},
      createRunId: () => RUN_ID,
      now: () => NOW,
    });
    const turn = await service.startTurn({
      owner: {kind: "profile", profileId: PROFILE_ID},
      profileId: PROFILE_ID,
      message: "Please ask a person to call me.",
      locale: "en",
      trigger: "web",
      fallbackContactEmail: "member@m4a.example.test",
    });
    await drain(turn);

    expect(provider).not.toHaveBeenCalled();
    expect(embedding).not.toHaveBeenCalled();
    expect(tools).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      status: "disabled",
      costUsd: "0.000000",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(tasks).toEqual([
      expect.objectContaining({
        kind: "concierge_general_follow_up",
        summaryCode: "human_requested",
      }),
    ]);
  });

  it("fails closed unless flags, runtime, trusted origin, and request origin are all local", async () => {
    const route = await import("@/lib/ai/m4a-acceptance-boundary") as unknown as {
      isM4AAcceptanceRequest?: (
        environment: Readonly<Record<string, string | undefined>>,
        requestUrl: string,
      ) => boolean;
    };
    expect(route.isM4AAcceptanceRequest).toBeTypeOf("function");
    if (!route.isM4AAcceptanceRequest) return;
    const authorized = {
      M4A_DETERMINISTIC_ACCEPTANCE: "true",
      M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED: "true",
      APP_URL: "http://localhost:3100",
    };
    expect(route.isM4AAcceptanceRequest(
      authorized,
      "http://localhost:3100/api/ai/concierge",
    )).toBe(true);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, APP_URL: "http://127.0.0.1:3100"},
      "http://127.0.0.1:3100/api/ai/concierge",
    )).toBe(true);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, VERCEL: "1"},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, VERCEL: " "},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, VERCEL_ENV: "\t"},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, VERCEL: "", VERCEL_ENV: ""},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(true);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, VERCEL_ENV: "preview"},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, VERCEL_ENV: "development"},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      {...authorized, APP_URL: "https://www.hkwtia.org"},
      "http://localhost:3100/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      authorized,
      "http://localhost:3101/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest(
      authorized,
      "https://hkwtia.vercel.app/api/ai/concierge",
    )).toBe(false);
    expect(route.isM4AAcceptanceRequest({
      M4A_DETERMINISTIC_ACCEPTANCE: "true",
      APP_URL: "http://localhost:3100",
    }, "http://localhost:3100/api/ai/concierge")).toBe(false);
    expect(route.isM4AAcceptanceRequest({
      M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED: "true",
      APP_URL: "http://localhost:3100",
    }, "http://localhost:3100/api/ai/concierge")).toBe(false);
  });
  it("accepts a real browser-style loopback POST without proxy IP headers only when authorized", async () => {
    vi.stubEnv("M4A_DETERMINISTIC_ACCEPTANCE", "true");
    vi.stubEnv("M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED", "true");
    vi.stubEnv("APP_URL", "http://localhost:3100");
    try {
      const route = await import("@/app/api/ai/concierge/route");
      const response = await route.POST(new Request(
        "http://localhost:3100/api/ai/concierge",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3100",
          },
          body: JSON.stringify({
            message: "Tell me about approved WTIA membership benefits.",
            locale: "en",
          }),
        },
      ));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(await response.text()).toContain(
        "Approved WTIA membership benefits include community events.",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("partitions a zh first owner from an en second owner and their runs", async () => {
    const {createM4AAcceptanceBoundary} = await import(
      "@/lib/ai/m4a-acceptance-boundary"
    );
    const boundary = createM4AAcceptanceBoundary({now: () => NOW});
    const zhOwner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "a".repeat(64),
    };
    const enOwner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "b".repeat(64),
    };
    const zhTurn = await boundary.service.startTurn({
      owner: zhOwner,
      profileId: null,
      message: "請介紹已批准的 WTIA 會員福利。",
      locale: "zh-HK",
      trigger: "web",
    });
    expect(await drainText(zhTurn)).toBe(
      "已批准的 WTIA 會員福利包括社群活動。",
    );
    const enTurn = await boundary.service.startTurn({
      owner: enOwner,
      profileId: null,
      message: "Tell me about approved WTIA membership benefits.",
      locale: "en",
      trigger: "web",
    });
    expect(await drainText(enTurn)).toBe(
      "Approved WTIA membership benefits include community events.",
    );

    expect(enTurn.conversationId).not.toBe(zhTurn.conversationId);
    expect(enTurn.runId).not.toBe(zhTurn.runId);
    expect(boundary.snapshot().runs).toEqual([
      expect.objectContaining({
        id: zhTurn.runId,
        conversationId: zhTurn.conversationId,
        status: "completed",
      }),
      expect.objectContaining({
        id: enTurn.runId,
        conversationId: enTurn.conversationId,
        status: "completed",
      }),
    ]);
  });

  it("preserves repeated-turn continuity for one owner but rejects cross-owner reuse", async () => {
    const {createM4AAcceptanceBoundary} = await import(
      "@/lib/ai/m4a-acceptance-boundary"
    );
    const boundary = createM4AAcceptanceBoundary({now: () => NOW});
    const firstOwner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "c".repeat(64),
    };
    const otherOwner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "d".repeat(64),
    };
    const first = await boundary.service.startTurn({
      owner: firstOwner,
      profileId: null,
      message: "Tell me about approved WTIA membership benefits.",
      locale: "en",
      trigger: "web",
    });
    await drain(first);
    const repeated = await boundary.service.startTurn({
      owner: firstOwner,
      profileId: null,
      conversationId: first.conversationId,
      message: "Tell me again about approved WTIA membership benefits.",
      locale: "en",
      trigger: "web",
    });
    await drain(repeated);
    expect(repeated.conversationId).toBe(first.conversationId);

    await expect(boundary.service.startTurn({
      owner: otherOwner,
      profileId: null,
      conversationId: first.conversationId,
      message: "Show me the other client's context.",
      locale: "en",
      trigger: "web",
    })).rejects.toThrow("FORBIDDEN");
    expect(boundary.snapshot().runs).toHaveLength(2);
    expect(boundary.snapshot().runs.every(
      (run) => run.conversationId === first.conversationId,
    )).toBe(true);
  });
  it("drives the real web route through service/runtime and persists priced telemetry", async () => {
    const route = await import("@/lib/api/concierge-route") as unknown as {
      createM4AAcceptanceBoundary?: (options?: unknown) => {
        service: ReturnType<typeof createConciergeService>;
        snapshot(): {
          runs: readonly Record<string, unknown>[];
          providerCalls: number;
          approvals: readonly Record<string, unknown>[];
        };
        createWoztellDependencies(
          channel: ChannelAdapter,
        ): WoztellWebhookProcessorDependencies;
      };
      createConciergePostHandler: typeof import("@/lib/api/concierge-route")["createConciergePostHandler"];
    };
    expect(route.createM4AAcceptanceBoundary).toBeTypeOf("function");
    if (!route.createM4AAcceptanceBoundary) return;
    const boundary = route.createM4AAcceptanceBoundary({now: () => NOW});
    const post = route.createConciergePostHandler({
      expectedOrigin: "https://www.hkwtia.org",
      cookieSecret: "m4a-acceptance-cookie-secret-at-least-32-bytes",
      rateLimiter: {check: () => ({
        allowed: true,
        remaining: 19,
        retryAfterSeconds: 0,
      })},
      verifyTurnstile: async () => true,
      getActor: async () => ({profileId: PROFILE_ID}),
      service: boundary.service,
    });
    const response = await post(new Request(
      "https://www.hkwtia.org/api/ai/concierge",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://www.hkwtia.org",
          "x-vercel-forwarded-for": "203.0.113.44",
        },
        body: JSON.stringify({
          message: "Tell me about approved WTIA membership benefits.",
          locale: "en",
        }),
      },
    ));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("event: done");
    expect(boundary.snapshot()).toMatchObject({
      providerCalls: 1,
      runs: [expect.objectContaining({
        trigger: "web",
        status: "completed",
        inputTokens: 100,
        outputTokens: 20,
        costUsd: "0.000072",
      })],
    });
  });

  it("drives the verified WOZTELL webhook through the same service/runtime telemetry", async () => {
    const route = await import("@/lib/api/concierge-route") as unknown as {
      createM4AAcceptanceBoundary?: () => {
        snapshot(): {runs: readonly Record<string, unknown>[]; providerCalls: number};
        createWoztellDependencies(
          channel: ChannelAdapter,
        ): WoztellWebhookProcessorDependencies;
      };
    };
    expect(route.createM4AAcceptanceBoundary).toBeTypeOf("function");
    if (!route.createM4AAcceptanceBoundary) return;
    const boundary = route.createM4AAcceptanceBoundary();
    const secret = "m4a-review-woztell-secret";
    const channel = createWoztellAdapter(
      {WOZTELL_WEBHOOK_SECRET: secret},
      vi.fn(),
    );
    const post = createProductionWoztellWebhookPostHandler({
      channel,
      processorDependencies: boundary.createWoztellDependencies(channel),
    });
    const body = JSON.stringify({
      from: "+85290000000",
      type: "TEXT",
      messageId: "wamid.m4a.review.telemetry",
      timestamp: "2026-07-28T03:30:00.000Z",
      data: {text: "Tell me about approved WTIA membership benefits."},
    });
    const response = await post(new Request(
      "https://www.hkwtia.org/api/webhooks/woztell",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-woztell-signature": createHmac("sha256", secret)
            .update(body)
            .digest("base64"),
        },
        body,
      },
    ));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({status: "accepted"});
    expect(boundary.snapshot()).toMatchObject({
      providerCalls: 1,
      runs: [expect.objectContaining({
        trigger: "whatsapp",
        status: "completed",
        inputTokens: 100,
        outputTokens: 20,
        costUsd: "0.000072",
      })],
    });
  });

  it("keeps Platinum email pending while real send/log capabilities remain callable but unused", async () => {
    const sendEmail = vi.fn(async () => ({providerId: "must-not-send"}));
    const writeEmailLog = vi.fn(async () => ({id: "must-not-log"}));
    const route = await import("@/lib/api/concierge-route") as unknown as {
      createM4AAcceptanceBoundary?: (options: unknown) => {
        service: ReturnType<typeof createConciergeService>;
        snapshot(): {approvals: readonly Record<string, unknown>[]};
      };
    };
    expect(route.createM4AAcceptanceBoundary).toBeTypeOf("function");
    if (!route.createM4AAcceptanceBoundary) return;
    const boundary = route.createM4AAcceptanceBoundary({
      now: () => NOW,
      emailCapabilities: {sendEmail, writeEmailLog},
    });
    const turn = await boundary.service.startTurn({
      owner: {kind: "profile", profileId: PROFILE_ID},
      profileId: PROFILE_ID,
      message: "Draft an email about my Platinum membership.",
      confirmedContactEmail: "member@m4a.example.test",
      locale: "en",
      trigger: "web",
    });
    await drain(turn);
    expect(boundary.snapshot().approvals).toEqual([
      expect.objectContaining({status: "pending"}),
    ]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(writeEmailLog).not.toHaveBeenCalled();
  });

  it.each([
    {
      locale: "en" as const,
      message: "What are the approved WTIA membership benefits?",
      provider: {
        keywords: ["approved", "membership"],
        action: "kb_search" as const,
        toolInput: {query: "membership", k: 3},
      },
      knowledge: [{
        title: "WTIA Membership",
        excerpt: "Approved membership benefits include community events.",
        score: 0.95,
        url: "https://www.hkwtia.org/membership",
      }],
      source: "WTIA Membership",
    },
    {
      locale: "zh-HK" as const,
      message: "列出已發布的 WTIA 活動",
      provider: {
        keywords: ["已發布", "活動"],
        action: "list_events" as const,
        toolInput: {
          from: "2026-07-28T00:00:00.000Z",
          to: "2027-07-28T00:00:00.000Z",
          limit: 5,
        },
      },
      knowledge: [],
      events: [{
        slug: "m4a-innovation-exchange",
        title: "WTIA 創科交流會",
        description: "已發布的雙語活動資料。",
        startsAt: "2026-09-08T10:00:00.000Z",
        endsAt: "2026-09-08T12:00:00.000Z",
        venue: "香港",
      }],
      source: "WTIA 創科交流會",
    },
  ])("returns $locale facts only with approved bilingual citations", async ({
    locale,
    message,
    provider,
    knowledge,
    events,
    source,
  }) => {
    const actual = await executeOfflineCase({
      id: `m4a-acceptance-source-${locale}`,
      locale,
      request: {
        message,
        channel: "web",
        authenticatedProfileId: null,
        agentsEnabled: true,
      },
      scenario: {
        provider,
        repositories: {knowledge, events: events ?? [], memberContext: null},
      },
    });
    expect(actual.status).toBe("completed");
    expect(actual.citations).toEqual([
      expect.objectContaining({title: source}),
    ]);
    expect(actual.trace).toMatchObject({
      conciergeServiceInvoked: true,
      agentRuntimeInvoked: true,
      approvedToolRegistryInvoked: true,
    });
  });

  it("returns 401 before parsing for an invalid WOZTELL secret", async () => {
    const body = JSON.stringify({type: "TEXT", data: {text: "Hello"}});
    const process = vi.fn();
    const post = createWoztellWebhookPostHandler({
      channel: createWoztellAdapter(
        {WOZTELL_WEBHOOK_SECRET: "fixture-secret"},
        vi.fn(),
      ),
      process,
    });
    const response = await post(new Request(
      "https://www.hkwtia.org/api/webhooks/woztell",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-woztell-signature": createHmac("sha256", "wrong-secret")
            .update(body)
            .digest("base64"),
        },
        body,
      },
    ));
    expect(response.status).toBe(401);
    expect(process).not.toHaveBeenCalled();
  });

  it("blocks WhatsApp free-form replies outside the 24-hour window", async () => {
    const fetchImpl = vi.fn();
    const adapter = createWoztellAdapter({}, fetchImpl);
    await expect(adapter.sendSessionMessage({
      whatsappOptIn: true,
      whatsappNumber: "+85290000000",
      text: "Session reply",
      idempotencyKey: "m4a-acceptance:outside-window",
      lastCustomerMessageAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1_000 - 1),
    })).resolves.toEqual({
      status: "blocked",
      reason: "outside_customer_service_window",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deletes only expired conversations at the twelve-month cutoff", async () => {
    const conversations = [
      {id: "expired", expiresAt: new Date("2026-07-28T03:59:59.999Z")},
      {id: "boundary", expiresAt: new Date("2026-07-28T04:00:00.000Z")},
      {id: "current", expiresAt: new Date("2026-07-28T04:00:00.001Z")},
    ];
    const deleted: string[] = [];
    const result = await runChatRetention({
      now: NOW,
      batchSize: 10,
      maxBatches: 3,
      repository: {
        async inspect() {
          throw new Error("UNEXPECTED_DRY_RUN");
        },
        async redactRunsBatch() {
          return 0;
        },
        async deleteMessagesBatch() {
          return 0;
        },
        async removeEmptyConversationsBatch(now) {
          const expired = conversations.filter(({expiresAt}) => expiresAt <= now);
          deleted.push(...expired.map(({id}) => id));
          return {
            conversationsDeleted: expired.length,
            runsUnlinked: expired.length,
            runsRedacted: 0,
          };
        },
      },
    });
    expect(deleted).toEqual(["expired", "boundary"]);
    expect(result.conversationsDeleted).toBe(2);
    expect(conversations.map(({id}) => id).filter((id) => !deleted.includes(id)))
      .toEqual(["current"]);
  });

  it("exposes one idempotent, M4A-scoped member/event/cleanup seed contract", async () => {
    const seedModule = await import("@/scripts/seed-m4a") as unknown as {
      M4A_ACCEPTANCE_FIXTURE?: Readonly<{
        member: {id: string};
        events: readonly {id: string; titleEn: string; titleZh: string}[];
        namespace: string;
      }>;
      reconcileM4AAcceptanceFixture?: (
        repository: {
          reconcile(fixture: unknown): Promise<void>;
        },
      ) => Promise<void>;
    };
    expect(seedModule.M4A_ACCEPTANCE_FIXTURE).toMatchObject({
      member: {id: PROFILE_ID},
      namespace: "m4a-core-v1",
      events: expect.arrayContaining([
        expect.objectContaining({
          titleEn: expect.any(String),
          titleZh: expect.any(String),
        }),
      ]),
    });
    expect(typeof seedModule.reconcileM4AAcceptanceFixture).toBe("function");
    if (
      !seedModule.M4A_ACCEPTANCE_FIXTURE
      || !seedModule.reconcileM4AAcceptanceFixture
    ) return;
    const snapshots: string[] = [];
    const repository = {
      async reconcile(fixture: unknown) {
        snapshots.splice(0, snapshots.length, JSON.stringify(fixture));
      },
    };
    await seedModule.reconcileM4AAcceptanceFixture(repository);
    const first = [...snapshots];
    await seedModule.reconcileM4AAcceptanceFixture(repository);
    expect(snapshots).toEqual(first);
    expect(snapshots.join("")).not.toMatch(/\bm[123][-_]/i);
  });
});

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "true")(
  "M4A isolated database acceptance",
  () => {
    it("reconciles the fixed fixture twice and removes only its approval/task residue", async () => {
      const databaseUrl = process.env.DATABASE_URL_TEST?.trim();
      if (!databaseUrl) throw new Error("DATABASE_URL_TEST_REQUIRED");
      const {
        M4A_ACCEPTANCE_FIXTURE,
        createM4AAcceptanceFixtureRepository,
        reconcileM4AAcceptanceFixture,
      } = await import("@/scripts/seed-m4a");
      const pool = new Pool({connectionString: databaseUrl, max: 1});
      try {
        const repository = createM4AAcceptanceFixtureRepository(pool);
        await reconcileM4AAcceptanceFixture(repository);
        await pool.query(
          `INSERT INTO approvals
             (id, action_type, payload, status, requested_by_profile_id)
           VALUES
             ('44000001-0000-4000-8000-000000000091',
              'agent.draft_email', '{}'::jsonb, 'pending', $1)
           ON CONFLICT (id) DO NOTHING`,
          [M4A_ACCEPTANCE_FIXTURE.member.id],
        );
        await pool.query(
          `INSERT INTO staff_tasks
             (id, profile_id, kind, dedupe_key, summary_code, context, status)
           VALUES
             ('44000001-0000-4000-8000-000000000092', $1,
              'concierge_general_follow_up', 'm4a-acceptance:cleanup',
              'human_requested', '{}'::jsonb, 'open')
           ON CONFLICT (id) DO NOTHING`,
          [M4A_ACCEPTANCE_FIXTURE.member.id],
        );
        await reconcileM4AAcceptanceFixture(repository);
        const counts = await pool.query<{
          profiles: number;
          events: number;
          approvals: number;
          tasks: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM profiles WHERE id = $1) AS profiles,
             (SELECT count(*)::int FROM events WHERE id = ANY($2::uuid[])) AS events,
             (SELECT count(*)::int FROM approvals
                WHERE requested_by_profile_id = $1
                  AND action_type = 'agent.draft_email') AS approvals,
             (SELECT count(*)::int FROM staff_tasks
                WHERE profile_id = $1
                  AND kind = ANY($3::text[])) AS tasks`,
          [
            M4A_ACCEPTANCE_FIXTURE.member.id,
            M4A_ACCEPTANCE_FIXTURE.events.map(({id}) => id),
            M4A_ACCEPTANCE_FIXTURE.cleanup.taskKinds,
          ],
        );
        expect(counts.rows[0]).toEqual({
          profiles: 1,
          events: M4A_ACCEPTANCE_FIXTURE.events.length,
          approvals: 0,
          tasks: 0,
        });
      } finally {
        await pool.end();
      }
    });
  },
);
