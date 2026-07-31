import "server-only";

import {createHmac} from "node:crypto";

import {createConciergeService} from "@/lib/ai/agents/concierge";
import {createOpenAIEmbeddingAdapter} from "@/lib/ai/embeddings";
import type {WoztellWebhookProcessorDependencies} from "@/lib/ai/woztell-webhook";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {createConciergeTools} from "@/lib/ai/tools/registry";
import type {ChannelAdapter} from "@/lib/channels/types";
import type {serverEnv} from "@/lib/config/env";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {agentToolsRepository} from "@/lib/db/repos/agent-tools";
import {conversationsRepository} from "@/lib/db/repos/conversations";
import {
  createPostgresWoztellStore,
  providerRunId,
} from "@/lib/db/repos/woztell";
import {
  createWoztellDeliveryOutboxRepository,
} from "@/lib/db/repos/woztell-delivery-outbox";
import {
  createWoztellProfileResolverRepository,
} from "@/lib/db/repos/woztell-profile-resolver";
import {
  createWoztellRunRecoveryRepository,
} from "@/lib/db/repos/woztell-run-recovery";

type RuntimeEnvironment = ReturnType<typeof serverEnv>;

function duplicateKey(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "23505",
  );
}

function metadataFrom(input: unknown): Record<string, unknown> {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || !("metadata" in input)
    || !input.metadata
    || typeof input.metadata !== "object"
    || Array.isArray(input.metadata)
  ) {
    return {};
  }
  return input.metadata as Record<string, unknown>;
}

function correlateAssistantMessage(input: unknown, runId: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  return {
    ...input,
    metadata: {
      ...metadataFrom(input),
      woztellRunId: runId,
    },
  };
}

function conversationsWithoutInboundAppend(runId: string) {
  return {
    create: conversationsRepository.create,
    getOwned: conversationsRepository.getOwned,
    async appendMessage(
      owner: Parameters<typeof conversationsRepository.appendMessage>[0],
      conversationId: string,
      input: unknown,
    ) {
      return conversationsRepository.appendMessage(
        owner,
        conversationId,
        correlateAssistantMessage(input, runId),
      );
    },
    listMessages: conversationsRepository.listMessages,
    async startAgentTurn(
      _owner: unknown,
      actor: Parameters<typeof agentRunsRepository.start>[0],
      _messageInput: unknown,
      input: unknown,
    ) {
      try {
        return {
          message: null,
          run: await agentRunsRepository.start(actor, input),
        };
      } catch (error) {
        if (!duplicateKey(error)) throw error;
        return {message: null, run: null};
      }
    },
  };
}

function approvedTemplateKeys(): ReadonlySet<
  "concierge_follow_up_en" | "concierge_follow_up_zh_hk"
> {
  const allowed = [
    "concierge_follow_up_en",
    "concierge_follow_up_zh_hk",
  ] as const;
  if (process.env.RUN_LIVE_WOZTELL !== "1") return new Set(allowed);
  const configured = new Set(
    (process.env.WOZTELL_APPROVED_TEMPLATE_KEYS ?? "")
      .split(",")
      .map((value) => value.trim()),
  );
  return new Set(allowed.filter((key) => configured.has(key)));
}

export function createProductionWoztellProcessorDependencies(
  env: RuntimeEnvironment,
  channel: ChannelAdapter,
): WoztellWebhookProcessorDependencies {
  const now = () => new Date();
  const store = createPostgresWoztellStore(now);
  const profileResolver = createWoztellProfileResolverRepository();
  const recovery = createWoztellRunRecoveryRepository();
  const deliveryOutbox = createWoztellDeliveryOutboxRepository();
  const appOrigin = env.appUrl;
  return {
    channel,
    ...store,
    ...profileResolver,
    ...recovery,
    ...deliveryOutbox,
    anonymousOwnerHash(normalizedSender) {
      const secret = env.conciergeCookieSecret ?? env.woztellWebhookSecret ?? "";
      return createHmac("sha256", secret)
        .update(normalizedSender)
        .digest("hex");
    },
    approvedTemplateKeys: approvedTemplateKeys(),
    supportUrl: `${appOrigin}/en/contact`,
    now,
    concierge: {
      async startTurn(input) {
        const runId = providerRunId(input.providerMessageId);
        const service = createConciergeService({
          agentsEnabled: env.agentsEnabled,
          model: env.agentModelConcierge,
          credentials: {
            ...(env.openaiApiKey === undefined
              ? {}
              : {openaiApiKey: env.openaiApiKey}),
            ...(env.anthropicApiKey === undefined
              ? {}
              : {anthropicApiKey: env.anthropicApiKey}),
          },
          appOrigin,
          conversations: conversationsWithoutInboundAppend(runId),
          agentTools: agentToolsRepository,
          getRuntime: () => createAgentRuntime({
            agentRuns: agentRunsRepository,
            createRunId: () => runId,
          }),
          getEmbedding: () =>
            createOpenAIEmbeddingAdapter(env.openaiApiKey ?? ""),
          createTools: createConciergeTools,
          audit: async () => undefined,
          createRunId: () => runId,
          now,
        });
        const turn = await service.startTurn({
          owner: input.owner,
          profileId: input.profileId,
          conversationId: input.conversationId,
          message: input.message,
          locale: input.locale,
          trigger: "whatsapp",
        });
        return {
          conversationId: turn.conversationId,
          runId: turn.runId,
          events: {
            async *[Symbol.asyncIterator]() {
              for await (const event of turn.events) {
                yield {event: event.event, data: {...event.data}};
              }
            },
          },
          cancel: turn.cancel,
        };
      },
    },
    async escalate(input) {
      const runId = providerRunId(
        `${input.providerMessageId}:${input.reason}`,
      );
      await agentToolsRepository.createStaffTask({
        kind: "agent",
        agent: "concierge",
        runId,
        conversationId: input.conversationId,
        profileId: input.profileId,
        trigger: "whatsapp",
      }, {
        profileId: input.profileId,
        kind: "concierge_escalation",
        summaryCode: "provider_handoff",
        reasonCode: "provider_handoff",
        locale: input.locale,
      });
    },
  };
}
