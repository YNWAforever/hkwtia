import {randomUUID} from "node:crypto";

import {
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
import type {
  AgentRuntimeFinish,
  AgentRuntimeRequest,
  AgentRuntimeStream,
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
  listMessages: (
    owner: ConversationOwner,
    conversationId: string,
  ) => Promise<readonly ConversationMessage[]>;
}>;

type Runtime = Readonly<{
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
    data: Readonly<{code: "AI_TEMPORARILY_UNAVAILABLE"}>;
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

function assistantCitations(
  finish: AgentRuntimeFinish,
): readonly AgentCitation[] {
  return finish.status === "disabled" ? [] : finish.citations;
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

      await dependencies.conversations.appendMessage(
        input.owner,
        conversation.id,
        {
          role: "user",
          channel: input.trigger,
          content: input.message,
          metadata: {locale},
          citations: [],
        },
      );

      const plannedRunId = createRunId();
      const actor = agentActor(plannedRunId, conversation.id, input);
      const controller = new AbortController();
      const forwardAbort = () => controller.abort(input.abortSignal?.reason);
      input.abortSignal?.addEventListener("abort", forwardAbort, {once: true});
      if (input.abortSignal?.aborted) forwardAbort();

      const runtime = dependencies.getRuntime(plannedRunId);
      let tools: AgentToolSet = {};
      let messages: AgentMessage[] = [{
        role: "user",
        content: input.message,
      }];
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
      });
      if (runtimeTurn.runId !== plannedRunId) {
        controller.abort();
        throw new Error("CONCIERGE_RUN_ID_MISMATCH");
      }

      let disabledTaskId: string | undefined;
      if (!dependencies.agentsEnabled) {
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
      }

      let completed = false;
      const events: AsyncIterable<ConciergeSseEvent> = {
        async *[Symbol.asyncIterator]() {
          let assistantText = "";
          try {
            yield {
              event: "meta",
              data: {
                conversationId: conversation.id,
                runId: runtimeTurn.runId,
              },
            };

            if (!dependencies.agentsEnabled) {
              await runtimeTurn.finish;
              completed = true;
              yield {
                event: "disabled",
                data: {taskId: disabledTaskId!},
              };
              return;
            }

            for await (const delta of runtimeTurn.textStream) {
              assistantText += delta;
              yield {event: "delta", data: {text: delta}};
            }
            const finish = await runtimeTurn.finish;
            const citations = assistantCitations(finish);
            let escalationId: string | null = null;

            if (finish.status === "escalated") {
              const task = await dependencies.agentTools.createStaffTask(
                actor,
                {
                  profileId: input.profileId,
                  kind: "concierge_escalation",
                  summaryCode: finish.code,
                  reasonCode: finish.code,
                  locale,
                },
              );
              escalationId = `WTIA-${task.id}`;
            }

            if (assistantText.trim()) {
              // Task 3 owns the terminal run transition. Persist the durable
              // assistant message immediately after that terminal result.
              await dependencies.conversations.appendMessage(
                input.owner,
                conversation.id,
                {
                  role: "assistant",
                  channel: input.trigger,
                  content: assistantText,
                  metadata: {locale, status: finish.status},
                  citations: [...citations],
                },
              );
            }

            completed = true;
            yield {
              event: "done",
              data: {citations, escalationId},
            };
          } catch {
            yield {
              event: "error",
              data: {code: "AI_TEMPORARILY_UNAVAILABLE"},
            };
          } finally {
            input.abortSignal?.removeEventListener("abort", forwardAbort);
            if (!completed && !controller.signal.aborted) controller.abort();
          }
        },
      };

      return {
        conversationId: conversation.id,
        runId: runtimeTurn.runId,
        events,
        async cancel() {
          if (!controller.signal.aborted) controller.abort();
        },
      };
    },
  });
}
