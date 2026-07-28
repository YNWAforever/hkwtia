import {
  createConciergeService,
  type ConciergeSseEvent,
} from "@/lib/ai/agents/concierge";
import {
  type AgentProvider,
  type AgentProviderFactory,
  type AgentStreamFinish,
  type AgentToolResult,
} from "@/lib/ai/provider";
import type {AgentProviderName} from "@/lib/ai/model";
import {
  createAgentRuntime,
  type AgentRuntimeRequest,
} from "@/lib/ai/runtime";
import {deliverWoztellReply} from "@/lib/ai/woztell-delivery";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {
  createConciergeTools,
  type ConciergeToolAuditEvent,
  type ConciergeToolRepositories,
} from "@/lib/ai/tools/registry";

type Locale = "en" | "zh-HK";
type ToolName =
  | "kb_search"
  | "get_member_context"
  | "list_events"
  | "get_funding_schemes"
  | "draft_email"
  | "create_task"
  | "escalate";
type ProviderAction =
  | "kb_search"
  | "list_events"
  | "get_funding_schemes"
  | "get_member_context"
  | "draft_email"
  | "escalate"
  | "refuse";

type RequestInput = Readonly<{
  message: string;
  channel: "web" | "whatsapp";
  authenticatedProfileId: string | null;
  agentsEnabled: boolean;
  confirmedContactEmail?: string | null;
  whatsapp?: Readonly<{
    within24Hours: boolean;
    templateApproved: boolean;
  }> | null;
}>;

export type OfflineScenarioCase = Readonly<{
  id: string;
  locale: Locale;
  request: RequestInput;
  scenario: Readonly<{
    provider: Readonly<{
      keywords: readonly string[];
      action: ProviderAction;
      toolInput?: Readonly<Record<string, unknown>>;
      safety?: "pii_exfiltration" | "prompt_injection";
    }>;
    repositories: Readonly<{
      knowledge: readonly unknown[];
      events: readonly unknown[];
      memberContext: unknown;
    }>;
  }>;
}>;

type SeedToolCall = Readonly<{
  name: ToolName;
  input: Readonly<Record<string, unknown>>;
  output: Readonly<{
    value: readonly unknown[];
    citations?: readonly Readonly<{
      sourceId: string;
      title: string;
      url: string;
      confidence: number;
    }>[];
  }>;
}>;

/**
 * Transitional legacy input. It deliberately excludes both the golden
 * `expected` object and the old mock final answer.
 */
export type OfflineRuntimeCase = Readonly<{
  id: string;
  locale: Locale;
  request: RequestInput;
  mock: Readonly<{toolCalls: readonly SeedToolCall[]}>;
}>;

type RuntimeInput = OfflineScenarioCase | OfflineRuntimeCase;

export type RuntimeHarnessDependencies = Readonly<{
  providerFactories?: Readonly<Record<AgentProviderName, AgentProviderFactory>>;
  model?: string;
  credentials?: AgentRuntimeRequest["credentials"];
}>;

export type OfflineRuntimeActual = Readonly<{
  status: string;
  text: string;
  citations: readonly Readonly<{
    sourceId: string;
    title: string;
    url?: string;
  }>[];
  toolCalls: readonly Readonly<{
    name: ToolName;
    input: Readonly<Record<string, unknown>>;
  }>[];
  audits: readonly ConciergeToolAuditEvent[];
  sideEffects: Readonly<{
    approvalStatus: "none" | "pending";
    emailSent: false;
    staffTaskCreated: boolean;
    providerCalled: boolean;
  }>;
  trace: Readonly<{
    conciergeServiceInvoked: true;
    agentRuntimeInvoked: true;
    approvedToolRegistryInvoked: boolean;
    toolResultRejected: boolean;
  }>;
}>;

type NormalizedScenario = Readonly<{
  provider: OfflineScenarioCase["scenario"]["provider"];
  repositories: OfflineScenarioCase["scenario"]["repositories"];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function kbRowsFromLegacy(calls: readonly SeedToolCall[]): unknown[] {
  const seeded = calls.find(({name}) => name === "kb_search");
  if (!seeded) return [];
  return seeded.output.value.flatMap((value) => {
    if (!isRecord(value) || !isRecord(value.citation)) return [];
    const {title, excerpt, score} = value;
    const url = value.citation.url;
    return typeof title === "string"
      && typeof excerpt === "string"
      && typeof score === "number"
      && typeof url === "string"
      ? [{title, excerpt, score, url}]
      : [];
  });
}

function normalizedScenario(input: RuntimeInput): NormalizedScenario {
  if ("scenario" in input) return input.scenario;
  const seeded = input.mock.toolCalls.find(({name}) => name === "kb_search");
  return {
    provider: {
      keywords: input.locale === "zh-HK" ? ["會員"] : ["membership"],
      action: "kb_search",
      toolInput: seeded?.input ?? {query: input.request.message, k: 3},
    },
    repositories: {
      knowledge: kbRowsFromLegacy(input.mock.toolCalls),
      events: [],
      memberContext: null,
    },
  };
}

function textStream(text: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      if (text) yield text;
    },
  };
}

function latestUserMessage(
  messages: readonly Readonly<{role: string; content: string}>[],
): string {
  return [...messages].reverse().find(({role}) => role === "user")?.content ?? "";
}

function matchesKeywords(message: string, keywords: readonly string[]): boolean {
  const normalized = message.toLocaleLowerCase("en");
  return keywords.every((keyword) =>
    normalized.includes(keyword.toLocaleLowerCase("en"))
  );
}

function resultValues(result: AgentToolResult): readonly unknown[] {
  return Array.isArray(result.value) ? result.value : [];
}

function firstRecord(result: AgentToolResult): Record<string, unknown> | null {
  const first = resultValues(result)[0];
  return isRecord(first) ? first : null;
}

function localized(
  locale: Locale,
  en: string,
  zh: string,
): string {
  return locale === "zh-HK" ? zh : en;
}

function responseFromTool(
  action: ProviderAction,
  result: AgentToolResult,
  locale: Locale,
): Readonly<{text: string; rejected: boolean}> {
  const values = resultValues(result);
  const first = firstRecord(result);
  if (action === "kb_search") {
    return first && typeof first.excerpt === "string"
      ? {text: first.excerpt, rejected: false}
      : {
        text: localized(
          locale,
          "I could not verify this request from an approved WTIA source.",
          "我無法從已核准的 WTIA 資料來源核實這項要求。",
        ),
        rejected: true,
      };
  }
  if (action === "list_events") {
    return first
      && typeof first.title === "string"
      && typeof first.startsAt === "string"
      ? {
        text: `${first.title} — ${first.startsAt} — ${
          typeof first.venue === "string" ? first.venue : "Online"
        }`,
        rejected: false,
      }
      : {
        text: localized(locale, "No verified event was found.", "找不到已核實的活動。"),
        rejected: true,
      };
  }
  if (action === "get_funding_schemes") {
    const eligible = values.find((value) =>
      isRecord(value) && value.potentiallyEligible === true
    );
    if (
      isRecord(eligible)
      && typeof eligible.name === "string"
      && typeof eligible.summary === "string"
      && typeof eligible.disclaimer === "string"
    ) {
      return {
        text: `${eligible.name}: ${eligible.summary} ${eligible.disclaimer}`,
        rejected: false,
      };
    }
    return {
      text: localized(
        locale,
        "No potentially eligible funding scheme was verified.",
        "未能核實任何可能符合資格的資助計劃。",
      ),
      rejected: true,
    };
  }
  if (action === "get_member_context") {
    if (first?.code === "member_context_denied") {
      return {
        text: localized(
          locale,
          "I cannot access member context unless you are signed in.",
          "你必須先登入，我才可以存取會員資料。",
        ),
        rejected: false,
      };
    }
    if (first?.code === "ok") {
      return {
        text: localized(
          locale,
          `Your membership tier is ${String(first.membershipTier ?? "unknown")}.`,
          `你的會員級別是 ${String(first.membershipTier ?? "未知")}。`,
        ),
        rejected: false,
      };
    }
    return {
      text: localized(locale, "Member context was unavailable.", "會員資料暫時不可用。"),
      rejected: true,
    };
  }
  if (action === "draft_email") {
    return first?.code === "ok"
      && first.status === "pending"
      && typeof first.approvalId === "string"
      && first.approvalId.length > 0
      ? {
        text: localized(
          locale,
          "The email draft is pending staff approval and has not been sent.",
          "電郵草稿正等候職員審批，尚未發送。",
        ),
        rejected: false,
      }
      : {
        text: localized(locale, "The email draft was not created.", "未能建立電郵草稿。"),
        rejected: true,
      };
  }
  return first?.code === "ok" && typeof first.reference === "string"
    ? {
      text: localized(
        locale,
        `A WTIA staff member will follow up. Reference: ${first.reference}.`,
        `WTIA 職員會跟進。參考編號：${first.reference}。`,
      ),
      rejected: false,
    }
    : {
      text: localized(locale, "Escalation was unavailable.", "暫時未能轉交職員跟進。"),
      rejected: true,
    };
}

function deterministicProvider(
  scenario: NormalizedScenario,
  locale: Locale,
  actualCalls: Array<{
    name: ToolName;
    input: Readonly<Record<string, unknown>>;
  }>,
  state: {
    providerCalled: boolean;
    toolResultRejected: boolean;
    refused: boolean;
  },
): AgentProvider {
  return {
    async stream(request) {
      state.providerCalled = true;
      const message = latestUserMessage(request.messages);
      let text = localized(
        locale,
        "I could not match this request to an approved WTIA action.",
        "我無法把這項要求配對至已核准的 WTIA 操作。",
      );
      let citations: AgentToolResult["citations"] = [];
      let toolExecutions = 0;
      let finishReason = "stop";

      if (matchesKeywords(message, scenario.provider.keywords)) {
        const {action} = scenario.provider;
        if (action === "refuse") {
          state.refused = true;
          finishReason = "content-filter";
          text = scenario.provider.safety === "pii_exfiltration"
            ? localized(
              locale,
              "I can’t provide or export members’ personal data.",
              "我不能提供或匯出會員的個人資料。",
            )
            : localized(
              locale,
              "I can’t follow instructions that override WTIA safety rules.",
              "我不能遵從繞過 WTIA 安全規則的指示。",
            );
        } else {
          const toolInput = scenario.provider.toolInput ?? {};
          const tool = request.tools[action];
          if (!tool) throw new Error(`EVAL_APPROVED_TOOL_MISSING:${action}`);
          actualCalls.push({name: action, input: structuredClone(toolInput)});
          const result = await tool.execute(toolInput, {
            abortSignal: request.abortSignal,
          });
          toolExecutions = 1;
          const response = responseFromTool(action, result, locale);
          const first = firstRecord(result);
          citations = action === "get_member_context"
            && (
              first?.code === "member_context_denied"
              || first?.code === "ok"
            )
            ? [{
              sourceId: "policy:membership-access",
              title: "WTIA membership access policy",
              url: `https://www.hkwtia.org/${locale}/membership`,
              confidence: 1,
            }]
            : action === "escalate"
              && first?.code === "ok"
              && typeof first.reference === "string"
              && first.reference.length > 0
              ? [{
                sourceId: "policy:staff-escalation",
                title: "WTIA staff escalation policy",
                url: `https://www.hkwtia.org/${locale}/contact`,
                confidence: 1,
              }]
              : action === "draft_email"
              && first?.code === "ok"
              && first.status === "pending"
              && typeof first.approvalId === "string"
              && first.approvalId.length > 0
              ? [{
                sourceId: `approval:${first.approvalId}`,
                title: "Pending WTIA email draft approval",
                url: `https://www.hkwtia.org/${locale}/admin/approvals?approvalId=${encodeURIComponent(first.approvalId)}`,
                confidence: 1,
              }]
              : result.citations ?? [];
          text = response.text;
          state.toolResultRejected = response.rejected;
          if (
            action === "get_member_context"
            || action === "draft_email"
            || action === "escalate"
          ) {
            finishReason = "policy";
          }
        }
      }

      const finish: AgentStreamFinish = {
        usage: {inputTokens: 10, outputTokens: 5},
        finishReason,
        steps: 1,
        toolExecutions,
        citations,
      };
      return {textStream: textStream(text), finish: Promise.resolve(finish)};
    },
  };
}

export async function executeOfflineCase(
  input: RuntimeInput,
  dependencies: RuntimeHarnessDependencies = {},
): Promise<OfflineRuntimeActual> {
  const scenario = normalizedScenario(input);
  const conversationId = `eval-conversation:${input.id}`;
  const runId = `eval-run:${input.id}`;
  const messages: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: Readonly<Record<string, unknown>>;
  }> = [];
  const actualCalls: Array<{
    name: ToolName;
    input: Readonly<Record<string, unknown>>;
  }> = [];
  const audits: ConciergeToolAuditEvent[] = [];
  const approvals: Array<{id: string; status: "pending"}> = [];
  const tasks: Array<{id: string; status: "open"}> = [];
  const providerState = {
    providerCalled: false,
    toolResultRejected: false,
    refused: false,
  };
  let registryInvoked = false;

  const repositories: ConciergeToolRepositories = {
    async searchKnowledge() {
      return scenario.repositories.knowledge as Awaited<
        ReturnType<ConciergeToolRepositories["searchKnowledge"]>
      >;
    },
    async getMemberContext() {
      return scenario.repositories.memberContext as Awaited<
        ReturnType<ConciergeToolRepositories["getMemberContext"]>
      >;
    },
    async listEvents() {
      return scenario.repositories.events as Awaited<
        ReturnType<ConciergeToolRepositories["listEvents"]>
      >;
    },
    async createDraftEmailApproval() {
      const approval = {
        id: `approval-${approvals.length + 1}`,
        status: "pending" as const,
      };
      approvals.push(approval);
      return approval;
    },
    async createStaffTask() {
      const task = {
        id: `task-${tasks.length + 1}`,
        status: "open" as const,
      };
      tasks.push(task);
      return task;
    },
  };
  const agentRuns = {
    async start() {},
    async configureModel() {},
    async finish() {},
    async fail() {},
    async escalate() {},
    async disable() {},
  };
  const deterministicFactory: AgentProviderFactory = () => deterministicProvider(
    scenario,
    input.locale,
    actualCalls,
    providerState,
  );
  const selectedFactories = dependencies.providerFactories ?? {
    openai: deterministicFactory,
    anthropic: deterministicFactory,
  };
  const instrument = (factory: AgentProviderFactory): AgentProviderFactory =>
    (options) => {
      const selected = factory(options);
      return {
        async stream(request) {
          providerState.providerCalled = true;
          return selected.stream(request);
        },
      };
    };
  const runtime = createAgentRuntime({
    agentRuns,
    providerFactories: {
      openai: instrument(selectedFactories.openai),
      anthropic: instrument(selectedFactories.anthropic),
    },
    createRunId: () => runId,
    now: () => new Date("2026-07-27T10:00:00.000Z"),
  });
  const service = createConciergeService({
    agentsEnabled: input.request.agentsEnabled,
    model: dependencies.model ?? "openai:gpt-4.1-mini",
    credentials: dependencies.credentials ?? {openaiApiKey: "offline-eval-only"},
    appOrigin: "https://www.hkwtia.org",
    conversations: {
      async create() {
        return {id: conversationId, locale: input.locale};
      },
      async getOwned() {
        return {id: conversationId, locale: input.locale};
      },
      async appendMessage(_owner, _id, value) {
        if (
          !isRecord(value)
          || (value.role !== "user" && value.role !== "assistant")
          || typeof value.content !== "string"
        ) throw new Error("INVALID_EVAL_MESSAGE");
        messages.push({
          role: value.role,
          content: value.content,
          ...(isRecord(value.metadata) ? {metadata: value.metadata} : {}),
        });
        return {id: `message-${messages.length}`};
      },
      async startAgentTurn(_owner, _actor, value) {
        if (!isRecord(value) || typeof value.content !== "string") {
          throw new Error("INVALID_EVAL_TURN_MESSAGE");
        }
        messages.push({role: "user", content: value.content});
        return {id: runId};
      },
      async listMessages() {
        return messages.map(({role, content}) => ({role, content}));
      },
    },
    agentTools: repositories,
    getRuntime: () => runtime,
    getEmbedding: () => ({
      dimensions: 1536,
      async embed() {
        return Array.from({length: 1536}, () => 0);
      },
    }),
    createTools(context) {
      registryInvoked = true;
      return createConciergeTools(context);
    },
    async audit(event) {
      audits.push(event);
    },
    createRunId: () => runId,
    now: () => new Date("2026-07-27T10:00:00.000Z"),
  });

  const owner = input.request.authenticatedProfileId === null
    ? {kind: "anonymous" as const, anonymousOwnerHash: "a".repeat(64)}
    : {
      kind: "profile" as const,
      profileId: input.request.authenticatedProfileId,
    };
  const turn = await service.startTurn({
    owner,
    profileId: input.request.authenticatedProfileId,
    message: input.request.message,
    locale: input.locale,
    trigger: input.request.channel,
    ...(input.request.confirmedContactEmail
      ? {confirmedContactEmail: input.request.confirmedContactEmail}
      : {}),
  });
  const events: ConciergeSseEvent[] = [];
  for await (const event of turn.events) events.push(event);
  const text = events
    .filter((event): event is Extract<ConciergeSseEvent, {event: "delta"}> =>
      event.event === "delta"
    )
    .map(({data}) => data.text)
    .join("");
  const done = events.find(
    (event): event is Extract<ConciergeSseEvent, {event: "done"}> =>
      event.event === "done",
  );
  const disabled = events.some(({event}) => event === "disabled");
  const assistant = [...messages].reverse().find(({role}) => role === "assistant");
  const toolNames = new Set(actualCalls.map(({name}) => name));
  const semanticStatus = providerState.refused
    ? "refused"
    : approvals.length > 0
      ? "pending_approval"
    : toolNames.has("escalate")
      ? "escalated"
      : toolNames.has("get_member_context")
        && input.request.authenticatedProfileId === null
        ? "refused"
        : disabled
          ? "disabled"
          : typeof assistant?.metadata?.status === "string"
            ? assistant.metadata.status
            : "completed";

  return {
    status: semanticStatus,
    text,
    citations: done?.data.citations ?? [],
    toolCalls: actualCalls,
    audits,
    sideEffects: {
      approvalStatus: approvals.length ? "pending" : "none",
      emailSent: false,
      staffTaskCreated: tasks.length > 0,
      providerCalled: providerState.providerCalled,
    },
    trace: {
      conciergeServiceInvoked: true,
      agentRuntimeInvoked: true,
      approvedToolRegistryInvoked: registryInvoked,
      toolResultRejected: providerState.toolResultRejected,
    },
  };
}

export type OfflineWhatsAppCase = Readonly<{
  locale: Locale;
  providerMessageId: string;
  receivedAt: Date;
  now: Date;
  templateApproved: boolean;
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>;
}>;

export type OfflineWhatsAppActual = Readonly<{
  status: "accepted" | "escalated";
  action: "session" | "template" | "escalate";
  template: WhatsAppTemplateKey | null;
  completed: boolean;
  durableEscalation: boolean;
  escalationReason: string | null;
  sessionSends: number;
  templateSends: number;
}>;

export async function executeOfflineWhatsAppCase(
  input: OfflineWhatsAppCase,
): Promise<OfflineWhatsAppActual> {
  const adapter = createWoztellAdapter({}, input.fetchImpl, () => input.now);
  let sessionSends = 0;
  let templateSends = 0;
  let template: WhatsAppTemplateKey | null = null;
  let completed = false;
  let escalationReason: string | null = null;
  const channel = {
    ...adapter,
    async sendSessionMessage(value: Parameters<typeof adapter.sendSessionMessage>[0]) {
      sessionSends += 1;
      return adapter.sendSessionMessage(value);
    },
    async sendTemplateMessage(value: Parameters<typeof adapter.sendTemplateMessage>[0]) {
      templateSends += 1;
      template = value.template;
      return adapter.sendTemplateMessage(value);
    },
  };
  const approvedTemplate = input.locale === "zh-HK"
    ? "concierge_follow_up_zh_hk"
    : "concierge_follow_up_en";
  const result = await deliverWoztellReply({
    providerMessageId: input.providerMessageId,
    sender: "+85290000000",
    receivedAt: input.receivedAt,
    text: localized(input.locale, "WTIA reply", "WTIA 回覆"),
    locale: input.locale,
    memberName: "Member",
    whatsappOptIn: true,
    async complete() {
      completed = true;
    },
    async escalate(reason) {
      escalationReason = reason;
    },
  }, {
    channel,
    approvedTemplateKeys: new Set<WhatsAppTemplateKey>(
      input.templateApproved ? [approvedTemplate] : [],
    ),
    supportUrl: `https://www.hkwtia.org/${input.locale}/contact`,
  });

  return {
    status: result.status,
    action: escalationReason
      ? "escalate"
      : templateSends > 0
        ? "template"
        : "session",
    template,
    completed,
    durableEscalation: escalationReason !== null,
    escalationReason,
    sessionSends,
    templateSends,
  };
}
