import "server-only";
import { z } from "zod";
import { createDraftGenerationService } from "./drafts/generation";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import { draftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import { agentRunsRepository } from "@/lib/db/repos/agent-runs";
import { createAgentRuntime } from "./runtime";
import { createAdminModelRegistry } from "./providers/registry";
import { DEFAULT_AGENT_MODEL_KEY } from "@/config/ai-pricing";
import type { AdminActor } from "@/lib/membership/lifecycle";
/** Feature-scoped config: no Auth-secret reuse or Concierge-cookie dependency. The application registry remains unapproved by default. */
function configuration() {
  const model =
    process.env.ADMIN_AI_APPLICATION_MODEL ?? DEFAULT_AGENT_MODEL_KEY;
  return {
    enabled:
      process.env.AGENTS_ENABLED === "true" &&
      process.env.ADMIN_AI_APPLICATION_DRAFTS_ENABLED === "true",
    model,
    registry: createAdminModelRegistry(model),
    credentials: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    },
  };
}
export async function prepareApplicationDraft(
  actor: AdminActor,
  applicationId: string,
) {
  const id = z.string().uuid().parse(applicationId),
    config = configuration();
  return createDraftGenerationService({
    kind: "application",
    promptVersion: "application-triage-v1",
    drafts: aiDraftsRepository,
    work: draftWorkRepository,
    configuration: () => config,
    runtime: (runId) =>
      createAgentRuntime({
        agentRuns: agentRunsRepository,
        administrativeTask: "application",
        modelRegistry: config.registry,
        createRunId: () => runId,
      }),
  }).prepareDraft(actor, id);
}
