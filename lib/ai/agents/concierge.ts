import {randomUUID} from "node:crypto";

import {
  CONCIERGE_AGENT_CONFIG,
  conciergeSystemPrompt,
  type ConciergeLocale,
} from "@/config/agents/concierge";
import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import type {EmbeddingAdapter} from "@/lib/ai/embeddings";
import type {
  AgentCitation,
  AgentMessage,
  AgentToolSet,
} from "@/lib/ai/provider";
import {
  AgentRuntimeError,
  type AgentRuntimeFinish,
  type AgentRuntimePreparedRun,
  type AgentRuntimeRequest,
  type AgentRuntimeStream,
} from "@/lib/ai/runtime";
import type {
  ConciergeToolAuditEvent,
  ConciergeToolContext,
} from "@/lib/ai/tools/registry";
import type {ConciergeToolRepositories} from "@/lib/db/repos/agent-tools";
import type {ConversationOwner} from "@/lib/db/repos/conversations";

type Conversation = Readonly<{
  id: string;
  locale: ConciergeLocale;
}>;

type ConversationMessage = Readonly<{
  role: "user" | "assistant" | "tool";
  content: string;
}>;

type Conversations = Readonly<{
  create: (
    owner: ConversationOwner,
    input: unknown,
  ) => Promise<Conversation>;
  getOwned: (
    owner: ConversationOwner,
    conversationId: string,
  ) => Promise<Conversation>;
  appendMessage: (
    owner: ConversationOwner,
    conversationId: string,
    input: unknown,
  ) => Promise<unknown>;
  startAgentTurn: (
    owner: ConversationOwner,
    actor: ConciergeAgentActor,
    messageInput: unknown,
    input: unknown,
  ) => Promise<unknown>;
  listMessages: (
    owner: ConversationOwner,
    conversationId: string,
  ) => Promise<readonly ConversationMessage[]>;
}>;

type Runtime = Readonly<{
  adoptPrestarted: (
    actor: AgentRuntimeRequest["actor"],
    runId: string,
  ) => AgentRuntimePreparedRun;
  stream: (request: AgentRuntimeRequest) => Promise<AgentRuntimeStream>;
}>;

export type ConciergeServiceDependencies = Readonly<{
  agentsEnabled: boolean;
  model: string;
  credentials: AgentRuntimeRequest["credentials"];
  appOrigin: string;
  conversations: Conversations;
  agentTools: Pick<ConciergeToolRepositories, "createStaffTask">;
  getRuntime: (runId: string) => Runtime;
  getEmbedding: () => EmbeddingAdapter;
  createTools: (context: ConciergeToolContext) => AgentToolSet;
  audit: (event: ConciergeToolAuditEvent) => Promise<void>;
  createRunId?: () => string;
  now?: () => Date;
}>;

export type ConciergeTurnInput = Readonly<{
  owner: ConversationOwner;
  profileId: string | null;
  conversationId?: string;
  message: string;
  locale: ConciergeLocale;
  trigger: "web" | "whatsapp";
  confirmedContactEmail?: string;
  abortSignal?: AbortSignal;
}>;

export type ConciergeSseEvent =
  | Readonly<{
    event: "meta";
    data: Readonly<{conversationId: string; runId: string}>;
  }>
  | Readonly<{event: "delta"; data: Readonly<{text: string}>}>
  | Readonly<{
    event: "done";
    data: Readonly<{
      citations: readonly AgentCitation[];
      escalationId: string | null;
    }>;
  }>
  | Readonly<{event: "disabled"; data: Readonly<{taskId: string}>}>
  | Readonly<{
    event: "error";
    data: Readonly<{
      code: "AI_TEMPORARILY_UNAVAILABLE";
      escalationId?: string;
    }>;
  }>;

export type ConciergeTurn = Readonly<{
  conversationId: string;
  runId: string;
  events: AsyncIterable<ConciergeSseEvent>;
  cancel: () => Promise<void>;
}>;

function historyMessages(
  records: readonly ConversationMessage[],
): AgentMessage[] {
  return records
    .filter((record): record is ConversationMessage & {
      role: "user" | "assistant";
    } => record.role === "user" || record.role === "assistant")
    .slice(-20)
    .map((record) => ({
      role: record.role,
      content: record.content,
    }));
}

function agentActor(
  runId: string,
  conversationId: string,
  input: ConciergeTurnInput,
): ConciergeAgentActor {
  return {
    kind: "agent",
    agent: "concierge",
    runId,
    conversationId,
    profileId: input.profileId,
    trigger: input.trigger,
  };
}

const SOCIAL_ONLY_MESSAGES = new Set([
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank you",
  "bye",
  "goodbye",
  "你好",
  "您好",
  "多謝",
  "唔該",
  "再見",
]);

const LOW_CONFIDENCE_HANDOFF: Readonly<Record<ConciergeLocale, string>> = {
  en: "I’m not confident enough to answer from the available WTIA sources. I’ve asked our team to follow up.",
  "zh-HK": "現有 WTIA 資料不足以讓我有信心回答。我已請團隊跟進。",
};

function requiresGrounding(message: string): boolean {
  const normalized = message
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[.!?。！？,，、'"]/g, "")
    .replace(/\s+/g, " ");
  return !SOCIAL_ONLY_MESSAGES.has(normalized);
}

function hasGroundedCitation(finish: AgentRuntimeFinish): boolean {
  return finish.status !== "disabled"
    && finish.citations.some(
      (citation) =>
        citation.confidence !== undefined
        && citation.confidence >= CONCIERGE_AGENT_CONFIG.confidenceThreshold,
    );
}

function assistantCitations(
  finish: AgentRuntimeFinish,
): readonly AgentCitation[] {
  if (finish.status === "disabled") return [];
  return finish.citations.map((citation) => ({
    sourceId: citation.sourceId,
    title: citation.title,
    ...(citation.url === undefined ? {} : {url: citation.url}),
  }));
}

export function createConciergeService(
  dependencies: ConciergeServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const createRunId = dependencies.createRunId ?? randomUUID;

  return Object.freeze({
    systemPrompt: conciergeSystemPrompt,

    async startTurn(input: ConciergeTurnInput): Promise<ConciergeTurn> {
      const conversation = input.conversationId
        ? await dependencies.conversations.getOwned(
          input.owner,
          input.conversationId,
        )
        : await dependencies.conversations.create(input.owner, {
          locale: input.locale,
          expiresAt: new Date(
            now().getTime() + 365 * 24 * 60 * 60 * 1_000,
          ),
        });
      const locale = conversation.locale;

      const plannedRunId = createRunId();
      const actor = agentActor(plannedRunId, conversation.id, input);
      await dependencies.conversations.startAgentTurn(
        input.owner,
        actor,
        {
          role: "user",
          channel: input.trigger,
          content: input.message,
          metadata: {locale},
          citations: [],
        },
        {startedAt: now()},
      );

      let cancellationRequested = false;
      const controller = new AbortController();
      const forwardAbort = () => {
        cancellationRequested = true;
        controller.abort(input.abortSignal?.reason);
      };
      input.abortSignal?.addEventListener("abort", forwardAbort, {once: true});
      if (input.abortSignal?.aborted) forwardAbort();

      const runtime = dependencies.getRuntime(plannedRunId);
      const preparedRun = runtime.adoptPrestarted(
        {
          conversationId: conversation.id,
          profileId: input.profileId,
          trigger: input.trigger,
        },
        plannedRunId,
      );
      if (preparedRun.runId !== plannedRunId) {
        const error = new Error("CONCIERGE_RUN_ID_MISMATCH");
        controller.abort();
        await preparedRun.fail(error);
        throw error;
      }
      let tools: AgentToolSet = {};
      let messages: AgentMessage[] = [{
        role: "user",
        content: input.message,
      }];
      try {
        if (dependencies.agentsEnabled) {
          messages = historyMessages(
            await dependencies.conversations.listMessages(
              input.owner,
              conversation.id,
            ),
          );
          tools = dependencies.createTools({
            actor,
            locale,
            repositories: dependencies.agentTools as ConciergeToolRepositories,
            embedding: dependencies.getEmbedding(),
            ...(input.confirmedContactEmail === undefined
              ? {}
              : {confirmedContactEmail: input.confirmedContactEmail}),
            appOrigin: dependencies.appOrigin,
            audit: dependencies.audit,
          });
        }
      } catch (error) {
        await preparedRun.fail(error);
        throw error;
      }

      const runtimeTurn = await runtime.stream({
        enabled: dependencies.agentsEnabled,
        disabledCode: "agent_disabled",
        model: dependencies.model,
        credentials: dependencies.credentials,
        actor: {
          conversationId: conversation.id,
          profileId: input.profileId,
          trigger: input.trigger,
        },
        system: conciergeSystemPrompt(locale),
        messages,
        tools,
        abortSignal: controller.signal,
        preparedRun,
        finalization: "deferred",
      });
      if (runtimeTurn.runId !== plannedRunId) {
        const error = new Error("CONCIERGE_RUN_ID_MISMATCH");
        controller.abort();
        await runtimeTurn.fail(error);
        throw error;
      }

      let disabledTaskId: string | undefined;
      if (!dependencies.agentsEnabled) {
        try {
          const task = await dependencies.agentTools.createStaffTask(actor, {
            profileId: input.profileId,
            kind: "concierge_general_follow_up",
            summaryCode: "human_requested",
            reasonCode: "human_requested",
            locale,
            ...(input.confirmedContactEmail === undefined
              ? {}
              : {contactEmail: input.confirmedContactEmail}),
          });
          disabledTaskId = task.id;
        } catch (error) {
          await runtimeTurn.fail(error);
          throw error;
        }
      }

      let completed = false;
      let cancellation: Promise<void> | undefined;
      function cancelPendingRun(): Promise<void> {
        if (completed) return Promise.resolve();
        cancellationRequested = true;
        if (cancellation) return cancellation;
        if (!controller.signal.aborted) controller.abort();
        cancellation = runtimeTurn
          .fail(new AgentRuntimeError("timeout"))
          .then(() => undefined);
        return cancellation;
      }
      function requireActiveTurn(): void {
        if (cancellationRequested) {
          throw new AgentRuntimeError("timeout");
        }
      }
      const events: AsyncIterable<ConciergeSseEvent> = {
        async *[Symbol.asyncIterator]() {
          let assistantText = "";
          const assistantDeltas: string[] = [];
          const groundingRequired = requiresGrounding(input.message);
          try {
            yield {
              event: "meta",
              data: {
                conversationId: conversation.id,
                runId: runtimeTurn.runId,
              },
            };
            requireActiveTurn();

            if (!dependencies.agentsEnabled) {
              await runtimeTurn.finish;
              requireActiveTurn();
              await runtimeTurn.finalize();
              completed = true;
              requireActiveTurn();
              yield {
                event: "disabled",
                data: {taskId: disabledTaskId!},
              };
              return;
            }

            for await (const delta of runtimeTurn.textStream) {
              requireActiveTurn();
              assistantText += delta;
              assistantDeltas.push(delta);
              if (!groundingRequired) {
                yield {event: "delta", data: {text: delta}};
                requireActiveTurn();
              }
            }
            requireActiveTurn();
            const finish = await runtimeTurn.finish;
            requireActiveTurn();
            const lowConfidence =
              finish.status === "completed"
              && groundingRequired
              && !hasGroundedCitation(finish);
            const effectiveFinish = lowConfidence
              ? {
                ...finish,
                status: "escalated" as const,
                code: "low_confidence" as const,
              }
              : finish;
            const responseText = lowConfidence
              ? LOW_CONFIDENCE_HANDOFF[locale]
              : assistantText;
            const citations = lowConfidence
              ? []
              : assistantCitations(effectiveFinish);
            let escalationId: string | null = null;

            if (effectiveFinish.status === "escalated") {
              requireActiveTurn();
              const task = await dependencies.agentTools.createStaffTask(
                actor,
                {
                  profileId: input.profileId,
                  kind: "concierge_escalation",
                  summaryCode: effectiveFinish.code,
                  reasonCode: effectiveFinish.code,
                  locale,
                },
              );
              requireActiveTurn();
              escalationId = `WTIA-${task.id}`;
            }

            if (groundingRequired) {
              if (lowConfidence) {
                yield {event: "delta", data: {text: responseText}};
                requireActiveTurn();
              } else {
                for (const delta of assistantDeltas) {
                  yield {event: "delta", data: {text: delta}};
                  requireActiveTurn();
                }
              }
            }

            if (responseText.trim()) {
              requireActiveTurn();
              await dependencies.conversations.appendMessage(
                input.owner,
                conversation.id,
                {
                  role: "assistant",
                  channel: input.trigger,
                  content: responseText,
                  metadata: {locale, status: effectiveFinish.status},
                  citations: [...citations],
                },
              );
              requireActiveTurn();
            }

            requireActiveTurn();
            await runtimeTurn.finalize(
              lowConfidence
                ? {status: "escalated", code: "low_confidence"}
                : undefined,
            );
            completed = true;
            requireActiveTurn();
            yield {
              event: "done",
              data: {citations, escalationId},
            };
          } catch (error) {
            await runtimeTurn.fail(error);
            let escalationId: string | undefined;
            if (
              error instanceof AgentRuntimeError
              && !cancellationRequested
              && error.toolExecutions > 0
            ) {
              try {
                const task = await dependencies.agentTools.createStaffTask(
                  actor,
                  {
                    profileId: input.profileId,
                    kind: "concierge_escalation",
                    summaryCode: "tool_unavailable",
                    reasonCode: "tool_unavailable",
                    locale,
                  },
                );
                escalationId = `WTIA-${task.id}`;
              } catch {
                // Preserve the stable public error if escalation persistence
                // is temporarily unavailable.
              }
            }
            yield {
              event: "error",
              data: {
                code: "AI_TEMPORARILY_UNAVAILABLE",
                ...(escalationId === undefined ? {} : {escalationId}),
              },
            };
          } finally {
            input.abortSignal?.removeEventListener("abort", forwardAbort);
            if (!completed) await cancelPendingRun();
          }
        },
      };

      return {
        conversationId: conversation.id,
        runId: runtimeTurn.runId,
        events,
        async cancel() {
          await cancelPendingRun();
        },
      };
    },
  });
}
