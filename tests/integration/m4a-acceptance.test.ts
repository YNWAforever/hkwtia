import {createHmac} from "node:crypto";

import {describe, expect, it, vi} from "vitest";
import {Pool} from "pg";

import {createWoztellWebhookPostHandler} from "@/app/api/webhooks/woztell/route";
import {createConciergeService} from "@/lib/ai/agents/concierge";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {runChatRetention} from "@/lib/ai/retention";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {executeOfflineCase} from "@/evals/runtime-harness";

const NOW = new Date("2026-07-28T04:00:00.000Z");
const CONVERSATION_ID = "41111111-1111-4111-8111-111111111111";
const RUN_ID = "42222222-2222-4222-8222-222222222222";
const PROFILE_ID = "m4a-acceptance-member";

function textStream(...chunks: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

async function persistedRunFor(trigger: "web" | "whatsapp") {
  const record: Record<string, unknown> = {
    trigger,
    status: "missing",
    costUsd: null,
  };
  const providerCalls = vi.fn();
  const runtime = createAgentRuntime({
    agentRuns: {
      async start(actor, input) {
        Object.assign(record, {
          id: actor.runId,
          trigger: actor.trigger,
          status: "running",
          costUsd: "0.000000",
          ...(typeof input === "object" && input !== null ? input : {}),
        });
      },
      async configureModel(_actor, input) {
        Object.assign(record, input);
      },
      async finish(_actor, input) {
        Object.assign(record, input, {status: "completed"});
      },
      async fail(_actor, input) {
        Object.assign(record, input, {status: "failed"});
      },
      async escalate(_actor, input) {
        Object.assign(record, input, {status: "escalated"});
      },
      async disable(_actor, input) {
        Object.assign(record, input, {status: "disabled"});
      },
    },
    providerFactories: {
      openai: () => ({
        async stream() {
          providerCalls();
          return {
            textStream: textStream("Accepted"),
            finish: Promise.resolve({
              usage: {inputTokens: 100, outputTokens: 20},
              finishReason: "stop",
              steps: 1,
              toolExecutions: 0,
              citations: [],
            }),
          };
        },
      }),
      anthropic: () => {
        throw new Error("UNEXPECTED_PROVIDER");
      },
    },
    createRunId: () => `${RUN_ID.slice(0, -1)}${trigger === "web" ? "1" : "2"}`,
    now: () => NOW,
  });
  const turn = await runtime.stream({
    enabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "deterministic-test-only"},
    actor: {
      conversationId: CONVERSATION_ID,
      profileId: PROFILE_ID,
      trigger,
    },
    system: "Deterministic acceptance",
    messages: [{role: "user", content: "Hello"}],
    tools: {},
  });
  for await (const _chunk of turn.textStream) void _chunk;
  await turn.finish;
  return {record, providerCalls};
}

async function drain(
  turn: Awaited<ReturnType<
    ReturnType<typeof createConciergeService>["startTurn"]
  >>,
) {
  const events: unknown[] = [];
  for await (const event of turn.events) events.push(event);
  return events;
}

describe("M4A deterministic acceptance", () => {
  it.each(["web", "whatsapp"] as const)(
    "persists a terminal agent run with priced usage for every %s turn",
    async (trigger) => {
      const {record, providerCalls} = await persistedRunFor(trigger);
      expect(providerCalls).toHaveBeenCalledOnce();
      expect(record).toMatchObject({
        trigger,
        status: "completed",
        provider: "openai",
        model: "gpt-4.1-mini",
        inputTokens: 100,
        outputTokens: 20,
        costUsd: "0.000072",
      });
    },
  );

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

  it("keeps a Platinum email request pending and writes no email log", async () => {
    const actual = await executeOfflineCase({
      id: "m4a-acceptance-platinum-email",
      locale: "en",
      request: {
        message: "Draft an email about my Platinum membership.",
        channel: "web",
        authenticatedProfileId: PROFILE_ID,
        agentsEnabled: true,
        confirmedContactEmail: "member@m4a.example.test",
      },
      scenario: {
        provider: {
          keywords: ["draft", "email", "platinum"],
          action: "draft_email",
          toolInput: {
            recipient: "member@m4a.example.test",
            recipientConfirmed: true,
            subject: "Platinum membership follow-up",
            body: "Here is the requested Platinum membership information.",
          },
        },
        repositories: {
          knowledge: [],
          events: [],
          memberContext: {tier: "platinum"},
        },
      },
    });

    expect(actual.status).toBe("pending_approval");
    expect(actual.sideEffects).toMatchObject({
      approvalStatus: "pending",
      emailSent: false,
      providerCalled: true,
    });
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