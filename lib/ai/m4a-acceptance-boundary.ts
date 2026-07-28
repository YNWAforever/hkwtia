import "server-only";

import {createHash} from "node:crypto";

import {
  createConciergeService,
  type ConciergeServiceDependencies,
} from "@/lib/ai/agents/concierge";
import type {EmbeddingAdapter} from "@/lib/ai/embeddings";
import type {
  AgentCitationInput,
  AgentProviderFactory,
  AgentToolResult,
} from "@/lib/ai/provider";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {createConciergeTools} from "@/lib/ai/tools/registry";
import type {WoztellWebhookProcessorDependencies} from "@/lib/ai/woztell-webhook";
import type {ChannelAdapter} from "@/lib/channels/types";
import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import type {ConciergeToolRepositories} from "@/lib/db/repos/agent-tools";
import type {ConversationOwner} from "@/lib/db/repos/conversations";

const PROFILE_ID = "m4a-acceptance-member";
const MEMBERSHIP_URL = "https://www.hkwtia.org/membership";
const ACCEPTANCE_COOKIE_SECRET =
  "m4a-local-acceptance-cookie-secret-at-least-32-bytes";

type RunRecord = {
  id: string;
  conversationId: string;
  profileId: string | null;
  trigger: "web" | "whatsapp";
  status: "running" | "completed" | "failed" | "escalated" | "disabled";
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  summaryCode: string | null;
};
type AcceptanceMessage = {
  role: "user" | "assistant";
  content: string;
};

type AcceptanceConversation = {
  id: string;
  ownerKey: string;
  locale: "en" | "zh-HK";
  messages: AcceptanceMessage[];
};

function conversationOwnerKey(owner: ConversationOwner): string {
  return owner.kind === "profile"
    ? `profile:${owner.profileId}`
    : `anonymous:${owner.anonymousOwnerHash}`;
}

type BoundaryOptions = Readonly<{
  now?: () => Date;
  emailCapabilities?: Readonly<{
    sendEmail: (...args: readonly unknown[]) => Promise<unknown>;
    writeEmailLog: (...args: readonly unknown[]) => Promise<unknown>;
  }>;
}>;

type AcceptanceEnvironment = Readonly<Record<string, string | undefined>>;

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
}

function stringValue(input: unknown, fallback: string): string {
  return typeof input === "string" ? input : fallback;
}

function numberValue(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}

function dateValue(input: unknown, fallback: Date): Date {
  return input instanceof Date && Number.isFinite(input.getTime())
    ? input
    : fallback;
}

function loopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname === "::1";
}

function configuredLoopbackOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
      || !loopbackHostname(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function m4aAcceptanceOrigin(
  environment: AcceptanceEnvironment,
  requestUrl: string,
): string | null {
  if (
    environment.M4A_DETERMINISTIC_ACCEPTANCE !== "true"
    || environment.M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED !== "true"
    || Boolean(environment.VERCEL)
    || Boolean(environment.VERCEL_ENV)
  ) {
    return null;
  }
  const configuredOrigin = configuredLoopbackOrigin(environment.APP_URL);
  if (!configuredOrigin) return null;
  try {
    const request = new URL(requestUrl);
    if (
      !loopbackHostname(request.hostname)
      || request.origin !== configuredOrigin
    ) {
      return null;
    }
    return configuredOrigin;
  } catch {
    return null;
  }
}

export function isM4AAcceptanceRequest(
  environment: AcceptanceEnvironment,
  requestUrl: string,
): boolean {
  return m4aAcceptanceOrigin(environment, requestUrl) !== null;
}

export function m4aAcceptanceCookieSecret(): string {
  return ACCEPTANCE_COOKIE_SECRET;
}

function deterministicEmbedding(): EmbeddingAdapter {
  return Object.freeze({
    dimensions: 1536,
    async embed(text: string) {
      const digest = createHash("sha256")
        .update("hkwtia:m4a:local-acceptance:v1\0")
        .update(text)
        .digest();
      return Object.freeze(Array.from(
        {length: 1536},
        (_, index) => (digest[index % digest.length] - 127.5) / 127.5,
      ));
    },
  });
}

async function* textStream(text: string): AsyncIterable<string> {
  yield text;
}

export function createM4AAcceptanceBoundary(
  options: BoundaryOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const runs: RunRecord[] = [];
  const approvals: Array<Record<string, unknown>> = [];
  const tasks: Array<Record<string, unknown>> = [];
  const conversationsById = new Map<string, AcceptanceConversation>();
  const claimedMessages = new Set<string>();
  let providerCalls = 0;
  let conversationCounter = 0;
  let runCounter = 0;
  let approvalCounter = 0;
  let taskCounter = 0;

  const nextConversationId = () => {
    conversationCounter += 1;
    return `41111111-1111-4111-8111-${String(conversationCounter).padStart(12, "0")}`;
  };

  const nextRunId = () => {
    runCounter += 1;
    return `42222222-2222-4222-8222-${String(runCounter).padStart(12, "0")}`;
  };

  function createConversation(
    owner: ConversationOwner,
    locale: "en" | "zh-HK",
  ): AcceptanceConversation {
    const conversation: AcceptanceConversation = {
      id: nextConversationId(),
      ownerKey: conversationOwnerKey(owner),
      locale,
      messages: [],
    };
    conversationsById.set(conversation.id, conversation);
    return conversation;
  }

  function ownedConversation(
    owner: ConversationOwner,
    conversationId: string,
  ): AcceptanceConversation {
    const conversation = conversationsById.get(conversationId);
    if (
      !conversation
      || conversation.ownerKey !== conversationOwnerKey(owner)
    ) {
      throw new Error("FORBIDDEN");
    }
    return conversation;
  }

  function runFor(actor: ConciergeAgentActor): RunRecord {
    const run = runs.find(({id}) => id === actor.runId);
    if (
      !run
      || run.conversationId !== actor.conversationId
      || run.profileId !== actor.profileId
      || run.trigger !== actor.trigger
    ) {
      throw new Error("M4A_ACCEPTANCE_RUN_NOT_FOUND");
    }
    return run;
  }

  type RuntimeDependencies = Parameters<typeof createAgentRuntime>[0];
  const lifecycle: RuntimeDependencies["agentRuns"] = Object.freeze({
    async start(actor, input) {
      const values = record(input);
      const existing = runs.find(({id}) => id === actor.runId);
      if (existing) return existing;
      const created: RunRecord = {
        id: actor.runId,
        conversationId: actor.conversationId,
        profileId: actor.profileId,
        trigger: actor.trigger,
        status: "running",
        provider: typeof values.provider === "string" ? values.provider : null,
        model: typeof values.model === "string" ? values.model : null,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: "0.000000",
        summaryCode: null,
      };
      runs.push(created);
      return created;
    },
    async configureModel(actor, input) {
      const values = record(input);
      const run = runFor(actor);
      run.provider = stringValue(values.provider, "openai");
      run.model = stringValue(values.model, "gpt-4.1-mini");
      return run;
    },
    async finish(actor, input) {
      const values = record(input);
      const run = runFor(actor);
      run.status = "completed";
      run.inputTokens = numberValue(values.inputTokens);
      run.outputTokens = numberValue(values.outputTokens);
      run.costUsd = stringValue(values.costUsd, "0.000000");
      run.summaryCode = stringValue(values.summaryCode, "answered");
      return run;
    },
    async fail(actor, input) {
      const values = record(input);
      const run = runFor(actor);
      run.status = "failed";
      run.inputTokens = numberValue(values.inputTokens);
      run.outputTokens = numberValue(values.outputTokens);
      run.costUsd = stringValue(values.costUsd, "0.000000");
      run.summaryCode = stringValue(values.errorCode, "provider_error");
      return run;
    },
    async escalate(actor, input) {
      const values = record(input);
      const run = runFor(actor);
      run.status = "escalated";
      run.inputTokens = numberValue(values.inputTokens);
      run.outputTokens = numberValue(values.outputTokens);
      run.costUsd = stringValue(values.costUsd, "0.000000");
      run.summaryCode = stringValue(values.summaryCode, "low_confidence");
      return run;
    },
    async disable(actor, input) {
      const values = record(input);
      const run = runFor(actor);
      run.status = "disabled";
      run.inputTokens = numberValue(values.inputTokens);
      run.outputTokens = numberValue(values.outputTokens);
      run.costUsd = stringValue(values.costUsd, "0.000000");
      run.summaryCode = stringValue(values.summaryCode, "agent_disabled");
      return run;
    },
  });

  const repositoriesWithCapabilities: ConciergeToolRepositories & {
    sendEmail?: (...args: readonly unknown[]) => Promise<unknown>;
    writeEmailLog?: (...args: readonly unknown[]) => Promise<unknown>;
  } = Object.freeze({
    async searchKnowledge(_actor, input) {
      const answer = input.locale === "zh-HK"
        ? "已批准的 WTIA 會員福利包括社群活動。"
        : "Approved WTIA membership benefits include community events.";
      return Object.freeze([{
        title: input.locale === "zh-HK"
          ? "WTIA 會員福利"
          : "WTIA Membership Benefits",
        url: input.locale === "zh-HK"
          ? "https://www.hkwtia.org/zh-HK/membership"
          : MEMBERSHIP_URL,
        excerpt: answer,
        score: 0.95,
      }]);
    },
    async getMemberContext() {
      return {
        displayName: "M4A Acceptance Member",
        preferredLocale: "en" as const,
        companyDisplayName: "WTIA Acceptance Company",
        membershipTier: "platinum",
        membershipStatus: "active",
        renewalDate: "2027-07-28T00:00:00.000Z",
      };
    },
    async listEvents(_actor, input) {
      return Object.freeze([{
        slug: "m4a-community-exchange",
        title: input.locale === "zh-HK"
          ? "WTIA 社群交流活動"
          : "WTIA Community Exchange",
        description: input.locale === "zh-HK"
          ? "已批准的 WTIA 會員社群活動。"
          : "An approved WTIA member community event.",
        startsAt: "2026-09-08T10:00:00.000Z",
        endsAt: "2026-09-08T12:00:00.000Z",
        venue: "Hong Kong",
      }]);
    },
    async createDraftEmailApproval(_actor, input) {
      approvalCounter += 1;
      const approval = {
        id: `44444444-4444-4444-8444-${String(approvalCounter).padStart(12, "0")}`,
        status: "pending" as const,
        ...input,
      };
      approvals.push(approval);
      return approval;
    },
    async createStaffTask(_actor, input) {
      taskCounter += 1;
      const task = {
        id: `45555555-5555-4555-8555-${String(taskCounter).padStart(12, "0")}`,
        status: "open" as const,
        ...input,
      };
      tasks.push(task);
      return task;
    },
    ...(options.emailCapabilities?.sendEmail === undefined
      ? {}
      : {sendEmail: options.emailCapabilities.sendEmail}),
    ...(options.emailCapabilities?.writeEmailLog === undefined
      ? {}
      : {writeEmailLog: options.emailCapabilities.writeEmailLog}),
  });

  const providerFactory: AgentProviderFactory = () => ({
    async stream(request) {
      providerCalls += 1;
      const latestMessage = request.messages.at(-1)?.content ?? "";
      const wantsDraft = /\b(?:draft|email)\b/i.test(latestMessage)
        || /電郵|郵件|草擬/u.test(latestMessage);
      let citations: readonly AgentCitationInput[] = [];
      if (wantsDraft) {
        const result: AgentToolResult = await request.tools.draft_email.execute({
          recipient: "member@m4a.example.test",
          recipientConfirmed: true,
          subject: "Platinum membership follow-up",
          body: "Here is the requested Platinum membership information.",
        }, {abortSignal: request.abortSignal});
        citations = result.citations ?? [{
          sourceId: "m4a-membership",
          title: "WTIA Membership Benefits",
          url: MEMBERSHIP_URL,
          confidence: 1,
        }];
      } else {
        const result: AgentToolResult = await request.tools.kb_search.execute({
          query: latestMessage,
          k: 3,
        }, {abortSignal: request.abortSignal});
        citations = result.citations ?? [];
      }
      const isChinese = /[\u3400-\u9fff]/u.test(latestMessage);
      const answer = isChinese
        ? "已批准的 WTIA 會員福利包括社群活動。"
        : wantsDraft
          ? "I created a pending Platinum membership email draft for staff approval."
          : "Approved WTIA membership benefits include community events.";
      return {
        textStream: textStream(answer),
        finish: Promise.resolve({
          usage: {inputTokens: 100, outputTokens: 20},
          finishReason: "stop",
          steps: 1,
          toolExecutions: 1,
          citations,
        }),
      };
    },
  });

  const conversations: ConciergeServiceDependencies["conversations"] =
    Object.freeze({
      async create(owner, input) {
        const values = record(input);
        const locale = values.locale === "zh-HK" ? "zh-HK" : "en";
        const conversation = createConversation(owner, locale);
        return {id: conversation.id, locale: conversation.locale};
      },
      async getOwned(owner, conversationId) {
        const conversation = ownedConversation(owner, conversationId);
        return {id: conversation.id, locale: conversation.locale};
      },
      async appendMessage(owner, conversationId, input) {
        const conversation = ownedConversation(owner, conversationId);
        const values = record(input);
        const role = values.role === "assistant" ? "assistant" : "user";
        conversation.messages.push({
          role,
          content: stringValue(values.content, ""),
        });
        return {id: `message-${conversation.messages.length}`};
      },
      async startAgentTurn(owner, actor, messageInput, input) {
        const conversation = ownedConversation(owner, actor.conversationId);
        const message = record(messageInput);
        conversation.messages.push({
          role: "user",
          content: stringValue(message.content, ""),
        });
        const values = record(input);
        await lifecycle.start(actor, {
          provider: null,
          model: null,
          startedAt: dateValue(values.startedAt, now()),
        });
        return {id: actor.runId};
      },
      async listMessages(owner, conversationId) {
        const conversation = ownedConversation(owner, conversationId);
        return Object.freeze([...conversation.messages]);
      },
    });
  const service = createConciergeService({
    agentsEnabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "m4a-local-acceptance-key"},
    appOrigin: "https://www.hkwtia.org",
    conversations,
    agentTools: repositoriesWithCapabilities,
    getRuntime: (runId) => createAgentRuntime({
      agentRuns: lifecycle,
      providerFactories: {
        openai: providerFactory,
        anthropic: providerFactory,
      },
      createRunId: () => runId,
      now,
    }),
    getEmbedding: deterministicEmbedding,
    createTools: createConciergeTools,
    audit: async () => undefined,
    createRunId: nextRunId,
    now,
  });

  return Object.freeze({
    service,
    snapshot() {
      return Object.freeze({
        runs: Object.freeze(runs.map((run) => Object.freeze({...run}))),
        approvals: Object.freeze(
          approvals.map((approval) => Object.freeze({...approval})),
        ),
        tasks: Object.freeze(tasks.map((task) => Object.freeze({...task}))),
        providerCalls,
      });
    },
    createWoztellDependencies(
      channel: ChannelAdapter,
    ): WoztellWebhookProcessorDependencies {
      const dependencies: WoztellWebhookProcessorDependencies = {
        channel,
        async resolveProfile() {
          return {
            id: PROFILE_ID,
            displayName: "M4A Acceptance Member",
            locale: "en",
            whatsappOptIn: true,
          };
        },
        async claimInbound(input) {
          if (claimedMessages.has(input.providerMessageId)) {
            return {status: "duplicate"};
          }
          claimedMessages.add(input.providerMessageId);
          const conversation = createConversation(input.owner, input.locale);
          return {
            status: "accepted",
            conversationId: conversation.id,
            owner: input.owner,
            profileId: input.profileId,
            locale: input.locale,
            memberName: input.memberName,
            whatsappOptIn: input.whatsappOptIn,
          };
        },
        async markRunOwned() {},
        async markReplyReady() {},
        async markCompleted() {},
        async setWhatsappOptIn() {},
        concierge: service,
        async escalate(input) {
          taskCounter += 1;
          tasks.push({
            id: `45555555-5555-4555-8555-${String(taskCounter).padStart(12, "0")}`,
            status: "open",
            ...input,
          });
        },
        anonymousOwnerHash(normalizedSender) {
          return createHash("sha256").update(normalizedSender).digest("hex");
        },
        approvedTemplateKeys: new Set([
          "concierge_follow_up_en",
          "concierge_follow_up_zh_hk",
        ]),
        supportUrl: "https://www.hkwtia.org/contact",
        now,
      };
      return Object.freeze(dependencies);
    },
  });
}
