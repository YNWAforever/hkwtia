import "server-only";

import {createHmac} from "node:crypto";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {createConciergeService} from "@/lib/ai/agents/concierge";
import {createOpenAIEmbeddingAdapter} from "@/lib/ai/embeddings";
import type {WoztellWebhookProcessorDependencies} from "@/lib/ai/woztell-webhook";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {createConciergeTools} from "@/lib/ai/tools/registry";
import type {ChannelAdapter} from "@/lib/channels/types";
import type {AiEnv, AppEnv} from "@/lib/config/env";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {agentToolsRepository} from "@/lib/db/repos/agent-tools";
import {contactsRepository, contactWriterActor} from "@/lib/db/repos/contacts";
import {conversationsRepository} from "@/lib/db/repos/conversations";
import {suppressionsRepository, unsubscribeActor} from "@/lib/db/repos/suppressions";
import {
  createPostgresWoztellStore,
  providerRunId,
} from "@/lib/db/repos/woztell";
import {
  createWoztellDeliveryOutboxRepository,
} from "@/lib/db/repos/woztell-delivery-outbox";
import {
  createWoztellInboundEventsRepository,
  woztellWebhookActor,
} from "@/lib/db/repos/woztell-inbound-events";
import {
  createWoztellProfileResolverRepository,
} from "@/lib/db/repos/woztell-profile-resolver";
import {
  createWoztellRunRecoveryRepository,
} from "@/lib/db/repos/woztell-run-recovery";
import {
  approvedTemplateKeys,
  CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS,
} from "@/lib/whatsapp/approved-templates";

type RuntimeEnvironment = AppEnv & AiEnv;

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

/**
 * What the concierge may send UNATTENDED: the operator allowlist narrowed to the
 * two follow-up nudges.
 *
 * C1 Task 8 Step 0 moved the allowlist itself into
 * `lib/whatsapp/approved-templates.ts` so an admin page can import it without
 * dragging this module — and with it the concierge service, the OpenAI
 * embedding adapter and the agent runtime — into a page render. The narrowing
 * stays here, because it is a statement about the BOT and not about the
 * allowlist: the staff picker widens to all five approved templates, and a bot
 * that could reach for `dunning_3` on its own is a different product from one
 * that can send a follow-up nudge.
 *
 * The result is byte-for-byte what the deleted private function returned in both
 * modes, which is why `tests/unit/woztell-concierge.test.ts` and the four outbox
 * integration tests need no edit.
 */
function conciergeApprovedTemplateKeys(): ReadonlySet<WhatsAppTemplateKey> {
  const allowed = approvedTemplateKeys();
  return new Set([...CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS].filter((key) => allowed.has(key)));
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
  const inboundEvents = createWoztellInboundEventsRepository(now);
  const appOrigin = env.appUrl;
  return {
    channel,
    // Spread order is load-bearing and must not be tidied: `store.resolveProfile`
    // filters `WHERE profiles.whatsapp_opt_in = true` and
    // `profileResolver.resolveProfile` does not. The later spread wins, and
    // reversing these two turns an opted-out member into a stranger — a contact
    // row is created for them and the concierge answers. Anything added below
    // must not shadow either.
    ...store,
    ...profileResolver,
    ...recovery,
    ...deliveryOutbox,
    // C-1 Task 4. NOT a spread: S-14 gives every method on this repository a
    // capability actor as its first parameter, so the shapes do not match the
    // processor's `(event) => …` dependencies. Minting the actor here — one call
    // site, in server-only wiring — is what keeps the `unique symbol` a real gate
    // rather than a claim.
    async recordDeliveryStatus(event) {
      const {matched} = await inboundEvents.recordDeliveryStatus(
        woztellWebhookActor(),
        event,
      );
      return {matched};
    },
    async recordOutboundEcho(event) {
      const {disposition} = await inboundEvents.recordOutboundEcho(
        woztellWebhookActor(),
        event,
      );
      return {disposition};
    },
    async notifyAssignee(input) {
      await inboundEvents.notifyHumanLane(woztellWebhookActor(), input);
    },
    anonymousOwnerHash(normalizedSender) {
      const secret = env.conciergeCookieSecret ?? env.woztellWebhookSecret ?? "";
      return createHmac("sha256", secret)
        .update(normalizedSender)
        .digest("hex");
    },
    approvedTemplateKeys: conciergeApprovedTemplateKeys(),
    async recordContact(input) {
      const contact = await contactsRepository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
        phoneE164: input.phoneE164,
        locale: input.locale,
        receivedAt: input.receivedAt,
        whatsappMemberId: input.whatsappMemberId,
      });
      // The member-id write is guarded and refuses rather than raising 23505,
      // because a 500 from this route makes Woztell retry that sender's message
      // forever. `"conflict"` is the concurrent race the predicate cannot close,
      // and it becomes a staff task because a 23505 swallowed in silence is the
      // same as no guard at all. The DETERMINISTIC refusal is not this branch:
      // `linkWhatsAppMemberId` returns `"unchanged"` for it, deliberately — see
      // the comment there. Deciding which contact keeps the id is C2 Task 5's
      // merge-candidate work, not the webhook's.
      if (contact.memberIdLink === "conflict" && input.whatsappMemberId) {
        await inboundEvents.notifyMemberIdConflict(woztellWebhookActor(), {
          whatsappMemberId: input.whatsappMemberId,
          locale: input.locale,
        });
      }
      return {id: contact.id};
    },
    async recordOptOut(input) {
      if (input.profileId) {
        await suppressionsRepository.optOutWhatsApp(unsubscribeActor(), input.profileId, "whatsapp_stop");
      }
      await contactsRepository.markWhatsAppOptedOut(contactWriterActor("whatsapp"), input.phoneE164);
    },
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
