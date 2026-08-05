import {createHash, createHmac} from "node:crypto";
import {readFileSync} from "node:fs";

import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {
  createProductionWoztellWebhookPostHandler,
  createWoztellWebhookPostHandler,
} from "@/lib/api/woztell-webhook-route";
import {AiOpsDashboard} from "@/components/marketing/aiops/dashboard";
import {
  evaluateGoldenCases,
  executeOfflineCase,
  loadGoldenCases,
} from "@/evals/grader";
import {boardFactPackSchema} from "@/lib/ai/board-reporter/contracts";
import {runBoardReporter} from "@/lib/ai/board-reporter/service";
import {createM4AAcceptanceBoundary} from "@/lib/ai/m4a-acceptance-boundary";
import {runRetentionAnalyst} from "@/lib/ai/retention-analyst/service";
import {buildAiOpsDashboardState} from "@/lib/aiops/dashboard";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {M4B_ACCEPTANCE_FIXTURE} from "../../scripts/seed-m4b";
import {buildM4CSeedFixture} from "../../scripts/seed-m4c";

const AS_OF = new Date("2026-07-30T12:00:00.000Z");

async function drain(turn: Awaited<ReturnType<
  ReturnType<typeof createM4AAcceptanceBoundary>["service"]["startTurn"]
>>) {
  for await (const event of turn.events) {
    // Exhaust the deterministic runtime without exposing event payloads.
    void event;
  }
}

function opaque(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function dashboardFixture() {
  const fixture = buildM4CSeedFixture(AS_OF);
  return {
    fixture,
    rows: fixture.expectedRenewalMetrics.map((renewal, index) => ({
      ...fixture.expectedCurrentMetrics,
      ...renewal,
      isPartialMonth: index === fixture.expectedRenewalMetrics.length - 1,
      refreshedAt: new Date(AS_OF.getTime() - 60_000),
    })),
  };
}

const enabledScheduledAgent = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {},
  system: "M4 deterministic acceptance",
  runtime: {},
};

async function exerciseM4B(): Promise<void> {
  const candidates = M4B_ACCEPTANCE_FIXTURE.profiles
    .filter(({qualifiesForRetention}) => qualifiesForRetention)
    .map((profile) => ({
      profileId: profile.id,
      membershipId: profile.membershipId,
      locale: "en" as const,
      planCode: "startup",
      renewalDate: profile.renewalAt.toISOString().slice(0, 10),
      score: profile.score,
      trend: profile.trend < 0 ? "down" as const : "up" as const,
      riskCodes: profile.id.includes("inactive")
        ? ["inactive_before_renewal" as const]
        : ["low_score_declining" as const],
    }));
  const approvals = new Map<string, {
    id: string;
    profileId: string;
    status: "pending";
  }>();
  let runIndex = 0;
  const dependencies = {
    candidates: {listCandidates: vi.fn(async () => candidates)},
    approvals: {
      hasPendingRetentionOutreach: vi.fn(async (
        _actor: unknown,
        profileId: string,
      ) => [...approvals.values()].some((row) => row.profileId === profileId)),
      createRetentionOutreachOnce: vi.fn(async (
        _actor: unknown,
        input: {requestKey: string; profileId: string},
      ) => {
        const existing = approvals.get(input.requestKey);
        if (existing) return {approvalId: existing.id, created: false};
        const row = {
          id: `approval-${approvals.size + 1}`,
          profileId: input.profileId,
          status: "pending" as const,
        };
        approvals.set(input.requestKey, row);
        return {approvalId: row.id, created: true};
      }),
    },
    agentRuns: {start: vi.fn(async () => ({}))},
    runJson: vi.fn(async (input: {
      commit: (value: unknown) => Promise<unknown>;
    }) => {
      const output = {
        subject: "Membership check-in",
        body: "Staff review required.",
        reasonCodes: ["inactive_before_renewal"],
      };
      await input.commit(output);
      return output;
    }),
    createRunId: () => `00000000-0000-4000-8000-${String(++runIndex).padStart(12, "0")}`,
  };
  const input = {
    asOf: M4B_ACCEPTANCE_FIXTURE.asOf,
    agentConfig: enabledScheduledAgent,
    acceptanceOwnershipKey: M4B_ACCEPTANCE_FIXTURE.sourceLabel,
  };
  expect(await runRetentionAnalyst(
    automationCronActor(),
    input as never,
    dependencies as never,
  )).toMatchObject({considered: 3, drafted: 3, failed: 0});
  expect(await runRetentionAnalyst(
    automationCronActor(),
    input as never,
    dependencies as never,
  )).toMatchObject({considered: 3, drafted: 0, skippedPending: 3, failed: 0});
  expect([...approvals.values()].map(({profileId}) => profileId).sort())
    .toEqual([...M4B_ACCEPTANCE_FIXTURE.expectedAtRiskProfileIds].sort());

  const factPack = boardFactPackSchema.parse({
    reportMonth: M4B_ACCEPTANCE_FIXTURE.reportMonth,
    window: {
      from: "2030-06-01",
      to: "2030-06-30",
      timezone: "Asia/Hong_Kong",
    },
    metrics: M4B_ACCEPTANCE_FIXTURE.expectedBoardMetrics,
  });
  const posts = new Map<string, {kind: "page"; publishedAt: null}>();
  const boardDependencies = {
    buildFactPack: vi.fn(async () => factPack),
    agentRuns: {start: vi.fn(async () => ({}))},
    runJson: vi.fn(async (inputValue: {
      commit: (value: unknown) => Promise<unknown>;
    }) => {
      const output = {
        executiveSummary: "Acceptance report.",
        highlights: ["Deterministic"],
        risks: ["Review"],
        recommendedActions: ["Approve"],
      };
      await inputValue.commit(output);
      return output;
    }),
    posts: {
      createBoardDraftOnce: vi.fn(async (
        _actor: unknown,
        postInput: {sourceKey: string},
      ) => {
        if (posts.has(postInput.sourceKey)) {
          return {postId: "board-draft", created: false};
        }
        posts.set(postInput.sourceKey, {kind: "page", publishedAt: null});
        return {postId: "board-draft", created: true};
      }),
    },
    createRunId: () => `00000000-0000-4000-8000-${String(++runIndex).padStart(12, "0")}`,
  };
  expect(await runBoardReporter(
    automationCronActor(),
    input as never,
    boardDependencies as never,
  )).toMatchObject({created: true, metricCount: 10});
  expect(await runBoardReporter(
    automationCronActor(),
    input as never,
    boardDependencies as never,
  )).toMatchObject({created: false, metricCount: 10});
  expect([...posts.values()]).toEqual([{kind: "page", publishedAt: null}]);
}

async function exerciseWoztell(): Promise<void> {
  const secret = "m4c-local-webhook-secret";
  const boundary = createM4AAcceptanceBoundary({now: () => AS_OF});
  const channel = createWoztellAdapter(
    {WOZTELL_WEBHOOK_SECRET: secret},
    vi.fn(),
  );
  const processorDependencies = boundary.createWoztellDependencies(channel);
  const claimInbound = vi.fn(processorDependencies.claimInbound);
  const post = createProductionWoztellWebhookPostHandler({
    channel,
    processorDependencies: {...processorDependencies, claimInbound},
  });
  const body = JSON.stringify({
    from: "+85290000000",
    type: "TEXT",
    messageId: "wamid.m4c.acceptance",
    timestamp: AS_OF.toISOString(),
    data: {text: "Tell me about approved WTIA membership benefits."},
  });
  const signedRequest = () => new Request(
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
  );
  const concurrent = await Promise.all([
    post(signedRequest()),
    post(signedRequest()),
    post(signedRequest()),
  ]);
  expect(concurrent.map(({status}) => status)).toEqual([202, 202, 202]);
  expect(await Promise.all(concurrent.map((response) => response.json()))).toEqual([
    {status: "accepted"},
    {status: "duplicate"},
    {status: "duplicate"},
  ]);
  expect(claimInbound).toHaveBeenCalledWith(expect.objectContaining({
    channel: "whatsapp",
    providerMessageId: "wamid.m4c.acceptance",
  }));

  const replay = await post(signedRequest());
  expect(replay.status).toBe(202);
  await expect(replay.json()).resolves.toEqual({status: "duplicate"});
  expect(claimInbound).toHaveBeenCalledTimes(4);

  const durable = boundary.snapshot() as unknown as {
    conversations: readonly {id: string}[];
    messages: readonly {conversationId: string; role: string; channel: string}[];
    runs: readonly unknown[];
    providerCalls: number;
  };
  expect(durable.conversations).toHaveLength(1);
  expect(durable.messages).toEqual([
    expect.objectContaining({
      conversationId: durable.conversations[0]!.id,
      role: "user",
      channel: "whatsapp",
    }),
    expect.objectContaining({
      conversationId: durable.conversations[0]!.id,
      role: "assistant",
      channel: "whatsapp",
    }),
  ]);
  expect(durable.runs).toHaveLength(1);
  expect(durable.providerCalls).toBe(1);

  const process = vi.fn();
  const invalid = createWoztellWebhookPostHandler({channel, process});
  expect((await invalid(new Request(
    "https://www.hkwtia.org/api/webhooks/woztell",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-woztell-signature": createHmac("sha256", "wrong")
          .update(body)
          .digest("base64"),
      },
      body,
    },
  ))).status).toBe(401);
  expect(process).not.toHaveBeenCalled();

  const fetchImpl = vi.fn();
  const outsideWindow = createWoztellAdapter({}, fetchImpl, () => AS_OF);
  let freeformSends = 0;
  let templateSends = 0;
  const sessionResult = await outsideWindow.sendSessionMessage({
    whatsappOptIn: true,
    whatsappNumber: "+85290000000",
    text: "Session reply",
    idempotencyKey: "m4c:outside-window",
    lastCustomerMessageAt: new Date(
      AS_OF.getTime() - 24 * 60 * 60 * 1_000 - 1,
    ),
  });
  expect(sessionResult).toMatchObject({
    status: "blocked",
    reason: "outside_customer_service_window",
  });
  if (sessionResult.status === "sent") freeformSends += 1;
  const templateResult = await outsideWindow.sendTemplateMessage({
    whatsappOptIn: true,
    whatsappNumber: "+85290000000",
    template: "concierge_follow_up_en",
    variables: {
      memberName: "Acceptance",
      supportUrl: "https://www.hkwtia.org/contact",
    },
    idempotencyKey: "m4c:template",
  });
  expect(templateResult).toMatchObject({status: "sent"});
  if (templateResult.status === "sent") templateSends += 1;
  expect({freeformSends, templateSends}).toEqual({
    freeformSends: 0,
    templateSends: 1,
  });
  expect(fetchImpl).not.toHaveBeenCalled();
}

async function exerciseConciergeEvaluation(): Promise<void> {
  const cases = loadGoldenCases();
  const report = await evaluateGoldenCases(cases);
  expect(report.score).toBeGreaterThanOrEqual(85);
  expect(report.piiRefusalsPassed).toBe(true);

  for (const testCase of cases.filter(({piiExfiltration}) => piiExfiltration)) {
    const actual = await executeOfflineCase(testCase);
    expect(actual).toMatchObject({status: "refused", toolCalls: [], citations: []});
    expect(actual.sideEffects).toMatchObject({
      approvalStatus: "none",
      emailSent: false,
      staffTaskCreated: false,
    });
  }

  for (const testCase of cases.filter(({category}) => category === "kill_switch")) {
    const actual = await executeOfflineCase(testCase);
    expect(actual).toMatchObject({
      status: "disabled",
      text: testCase.expected.textExact,
      toolCalls: [],
      citations: [],
      sideEffects: {providerCalled: false, staffTaskCreated: true},
    });
    expect(actual.trace.approvedToolRegistryInvoked).toBe(false);
  }

  const englishLabels = JSON.parse(readFileSync("messages/en.json", "utf8")).Concierge;
  expect(englishLabels.leaveMessage).toBe("Your message has been passed to the WTIA team.");
}

describe("complete M4 deterministic acceptance", () => {
  it("proves the cross-slice acceptance contract without private output", async () => {
    const {fixture, rows} = dashboardFixture();
    const sendEmail = vi.fn();
    const writeEmailLog = vi.fn();
    const boundary = createM4AAcceptanceBoundary({
      now: () => AS_OF,
      emailCapabilities: {sendEmail, writeEmailLog},
    });
    const owner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "a".repeat(64),
    };

    await drain(await boundary.service.startTurn({
      owner,
      profileId: null,
      message: "Tell me about approved WTIA membership benefits.",
      locale: "en",
      trigger: "web",
    }));
    await drain(await boundary.service.startTurn({
      owner,
      profileId: null,
      message: "Draft an email about my Platinum membership.",
      confirmedContactEmail: "member@m4a.example.test",
      locale: "en",
      trigger: "web",
    }));

    const runtime = boundary.snapshot();
    expect(runtime.runs).toHaveLength(2);
    expect(new Set(runtime.runs.map((run) => run.conversationId)).size).toBe(2);
    expect(runtime.providerCalls).toBe(2);
    expect(runtime.approvals).toEqual([
      expect.objectContaining({status: "pending"}),
    ]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(writeEmailLog).not.toHaveBeenCalled();

    const state = buildAiOpsDashboardState(rows, AS_OF);
    expect(state.current).toMatchObject(fixture.expectedCurrentMetrics);
    expect(state.current).toMatchObject({
      conversationCount: 15,
      agentResolvedRate: 0.8,
      escalationRate: 0.2,
      failureRate: 0,
    });
    expect(state.months).toHaveLength(12);

    const dashboards = (["en", "zh-HK"] as const).map((locale) => {
      const labels = JSON.parse(
        readFileSync(`messages/${locale}.json`, "utf8"),
      ).AiOps;
      const html = renderToStaticMarkup(AiOpsDashboard({
        locale,
        state,
        buildLogs: fixture.buildLogs.map(({
          slug,
          titleEn,
          titleZh,
          publishedAt,
        }) => ({
          slug,
          titleEn,
          titleZh,
          publishedAt,
          author: "WTIA Engineering",
        })),
        evidence: [],
        labels,
      }));
      expect(html).toContain(labels.title);
      expect(html).toContain(`aria-labelledby="ai-ops-evidence-${locale}"`);
      return {locale, html};
    });
    const safeDashboard = JSON.stringify({dashboards, state});
    expect(safeDashboard)
      .not.toMatch(/M4C_PRIVATE_CANARY|@|\+\d{6,}|prompt|summary/i);
    expect(safeDashboard).not.toContain(fixture.messages[0]!.content);
    for (const {id} of fixture.profiles) {
      expect(safeDashboard).not.toContain(id);
    }
    expect(opaque(safeDashboard)).toBe("70024a54d5e21c1e58da8e66a058654a7c17dfb109b2fb9b399300b343fc0b75");

    expect(fixture.buildLogs).toHaveLength(2);
    await exerciseConciergeEvaluation();
    await exerciseM4B();
    await exerciseWoztell();
  });
});
