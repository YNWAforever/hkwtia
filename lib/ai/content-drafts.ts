import "server-only";
import { requireAdmin } from "@/lib/auth/authorize";
import type { AdminActor, Actor } from "@/lib/membership/lifecycle";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import { draftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import { agentRunsRepository } from "@/lib/db/repos/agent-runs";
import { createDraftGenerationService } from "./drafts/generation";
import { contentCaseId, parseContentCaseId } from "./drafts/content-facts";
import { approvedFactsHash } from "./drafts/validation";
import {
  approvedFactPackSchema,
  type ApprovedFactPack,
  type AdminAiDraft,
} from "./drafts/contracts";
import { createAgentRuntime } from "./runtime";
import { configuredAiBudgetLimits } from "@/lib/db/repos/ai-budget";
import {
  resolveAdminModel,
  createAdminModelRegistry,
} from "./providers/registry";
import { DEFAULT_AGENT_MODEL_KEY } from "@/config/ai-pricing";
export function contentDraftConfiguration() {
  const model = process.env.ADMIN_AI_CONTENT_MODEL ?? DEFAULT_AGENT_MODEL_KEY,
    base = createAdminModelRegistry(model);
  const enabled =
    process.env.ADMIN_AI_DRAFTS_ENABLED === "true" &&
    process.env.AGENTS_ENABLED === "true" &&
    process.env.ADMIN_AI_CONTENT_DRAFTS_ENABLED === "true";
  const registry = {
    ...base,
    content: {
      ...base.content,
      approvedForAdmin:
        process.env.ADMIN_AI_CONTENT_PROVIDER_APPROVED === "true",
    },
  };
  const credentials = enabled
    ? {
        openaiApiKey: process.env.OPENAI_API_KEY,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      }
    : {};
  let ready = false;
  try {
    const route = resolveAdminModel("content", registry);
    ready =
      enabled &&
      Boolean(configuredAiBudgetLimits()) &&
      Boolean(
        (route.provider === "openai"
          ? credentials.openaiApiKey
          : credentials.anthropicApiKey
        )?.trim(),
      );
  } catch {
    /* An unapproved administrative provider is unavailable. */
  }
  return { model, enabled, registry, credentials, ready };
}
/** Supplied packs are references only: both their hash and the freshly read server pack must agree. */
export function createContentDraftPreparationService(
  deps: Readonly<{
    drafts: Pick<typeof aiDraftsRepository, "getFacts">;
    generate: Readonly<{
      prepareDraft: (actor: Actor, caseId: string) => Promise<AdminAiDraft>;
    }>;
  }>,
) {
  return {
    async prepare(
      actor: AdminActor,
      input: Readonly<{
        kind: "event" | "news";
        sourceFacts: ApprovedFactPack;
      }>,
    ): Promise<AdminAiDraft> {
      requireAdmin(actor);
      const supplied = approvedFactPackSchema.parse(input.sourceFacts),
        source = parseContentCaseId(supplied.caseId);
      if (
        source.kind !== input.kind ||
        approvedFactsHash(supplied) !== supplied.versionHash
      )
        throw Error("CONTENT_SOURCE_INVALID");
      const current = await deps.drafts.getFacts(actor, {
        kind: "content",
        caseId: supplied.caseId,
      });
      if (current.versionHash !== supplied.versionHash)
        throw Error("DRAFT_GENERATION_STALE");
      return deps.generate.prepareDraft(actor, current.caseId);
    },
  };
}
/** Staff path uses the administrative draft/budget pipeline. It cannot reserve or bypass a member Writer quota. */
export async function prepareContentDraft(
  actor: AdminActor,
  input: Readonly<{ kind: "event" | "news"; sourceFacts: ApprovedFactPack }>,
): Promise<AdminAiDraft> {
  requireAdmin(actor);
  const config = contentDraftConfiguration();
  if (!config.enabled) throw Error("DRAFT_GENERATION_DISABLED");
  const generate = createDraftGenerationService({
    kind: "content",
    promptVersion: "content-copy-v1",
    drafts: aiDraftsRepository,
    work: draftWorkRepository,
    configuration: () => config,
    context: (actor, caseId, hash) =>
      aiDraftsRepository.getContentContext(actor, caseId, hash),
    runtime: (runId) =>
      createAgentRuntime({
        agentRuns: agentRunsRepository,
        administrativeTask: "content",
        modelRegistry: config.registry,
        createRunId: () => runId,
      }),
  });
  return createContentDraftPreparationService({
    drafts: aiDraftsRepository,
    generate,
  }).prepare(actor, input);
}
export function createContentDraftAdoptionService(
  drafts: Pick<typeof aiDraftsRepository, "withApprovedDraft">,
) {
  return {
    async adopt(
      actor: Actor,
      kind: "event" | "news",
      id: string,
      locale: "en" | "zh-HK",
      input: unknown,
    ) {
      requireAdmin(actor);
      return drafts.withApprovedDraft(
        actor,
        input,
        async (_tx, draft, body) => {
          const source = parseContentCaseId(draft.caseId);
          if (
            draft.kind !== "content" ||
            source.kind !== kind ||
            source.id !== id ||
            source.locale !== locale
          )
            throw Error("CONTENT_DRAFT_CASE_MISMATCH");
          return { body, locale: source.locale };
        },
      );
    },
  };
}
export const { adopt: adoptContentDraft } =
  createContentDraftAdoptionService(aiDraftsRepository);
export { contentCaseId };
