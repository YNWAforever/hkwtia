import {
  buildGroundedRetentionPrompt,
  validateRetentionDraft,
  RETENTION_GROUNDED_PROMPT_VERSION,
} from "./grounding";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  RetentionCandidatePageReader,
  RetentionCandidatePageItem,
} from "@/lib/db/repos/retention-analyst";

import { RETENTION_ANALYST_AGENT_CONFIG } from "@/config/agents/retention-analyst";
import {
  buildRetentionDraftPrompt,
  retentionDraftSchema,
  type RetentionDraft,
} from "@/lib/ai/retention-analyst/contracts";
import {
  deduplicateRetentionCandidates,
  type RetentionCandidate,
} from "@/lib/ai/retention-analyst/candidates";
import { runScheduledJson, type AgentConfig } from "@/lib/ai/scheduled-runtime";
import {
  draftWorkRepository,
  type DraftWorkClaim,
} from "@/lib/db/repos/ai-draft-work";
import { AI_PRICING_VERSION } from "@/config/ai-pricing";
import { hongKongDateKey } from "@/lib/automation/hong-kong-time";
import type { ScheduledAgentActor } from "@/lib/auth/agent-actor";
import {
  requireAutomationCron,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import { agentRunsRepository } from "@/lib/db/repos/agent-runs";
import {
  approvalsRepository,
  type RetentionOutreachApprovalInput,
} from "@/lib/db/repos/approvals";
import { retentionAnalystRepository } from "@/lib/db/repos/retention-analyst";

export type RetentionRunSummary = {
  considered: number;
  drafted: number;
  skippedPending: number;
  deduplicated: number;
  failed: number;
};

type RetentionDraftRunInput = Readonly<{
  actor: ScheduledAgentActor;
  agentConfig: AgentConfig;
  prompt: string;
  outputSchema: typeof retentionDraftSchema;
  commit?: (output: RetentionDraft) => Promise<void>;
  beforeDispatch?: () => Promise<void>;
  onProviderReceipt?: (requestId: string) => Promise<void>;
}>;

export type RetentionAnalystServiceDependencies = Readonly<{
  candidates: Readonly<{
    listCandidatePage?: RetentionCandidatePageReader;
    getCurrentCandidate?: typeof retentionAnalystRepository.getCurrentCandidate;
    listCandidates: (
      actor: AutomationCronActor,
      input: Readonly<{ asOf: Date }>,
    ) => Promise<readonly RetentionCandidate[]>;
  }>;
  approvals: Readonly<{
    hasPendingRetentionOutreach: (
      actor: AutomationCronActor,
      profileId: string,
    ) => Promise<boolean>;
    createRetentionOutreachOnce: (
      actor: ScheduledAgentActor,
      input: RetentionOutreachApprovalInput,
    ) => Promise<{ approvalId: string; created: boolean }>;
  }>;
  agentRuns: Readonly<{
    start: (
      actor: ScheduledAgentActor,
      input: Readonly<{
        provider: null;
        model: null;
        startedAt: Date;
        acceptanceOwnershipKey?: string;
      }>,
    ) => Promise<unknown>;
  }>;
  runJson: (input: RetentionDraftRunInput) => Promise<RetentionDraft>;
  createRunId: () => string;
  work?: Pick<
    typeof draftWorkRepository,
    | "claimDraftWork"
    | "markDraftRequestStarted"
    | "recordDraftProviderReceipt"
    | "finishDraftWork"
  >;
}>;

const defaultDependencies: RetentionAnalystServiceDependencies = {
  candidates: retentionAnalystRepository,
  approvals: approvalsRepository,
  agentRuns: agentRunsRepository,
  runJson: (input) => runScheduledJson(input),
  createRunId: randomUUID,
  work: draftWorkRepository,
};

function scheduledActor(runId: string): ScheduledAgentActor {
  return {
    kind: "agent",
    agent: "retention_analyst",
    runId,
    conversationId: null,
    profileId: null,
    trigger: "scheduled",
  };
}

function requestKeyFor(candidate: RetentionCandidate, asOf: Date): string {
  return [
    "retention",
    hongKongDateKey(asOf),
    candidate.profileId,
    RETENTION_ANALYST_AGENT_CONFIG.version,
  ].join(":");
}

export async function runRetentionAnalyst(
  actor: AutomationCronActor,
  input: Readonly<{
    asOf: Date;
    agentConfig: AgentConfig;
    concurrency?: number;
    acceptanceOwnershipKey?: string;
  }>,
  dependencies: RetentionAnalystServiceDependencies = defaultDependencies,
): Promise<RetentionRunSummary> {
  requireAutomationCron(actor);
  const emptySummary = (): RetentionRunSummary => ({
    considered: 0,
    drafted: 0,
    skippedPending: 0,
    deduplicated: 0,
    failed: 0,
  });
  if (!input.agentConfig.enabled) return emptySummary();

  const concurrency = z.coerce
    .number()
    .int()
    .min(1)
    .max(3)
    .parse(
      input.concurrency ?? process.env.ADMIN_AI_RETENTION_CONCURRENCY ?? 3,
    );
  const summary = emptySummary();
  type Candidate = RetentionCandidate | RetentionCandidatePageItem;
  async function* pages(): AsyncGenerator<readonly Candidate[]> {
    if (!dependencies.candidates.listCandidatePage) {
      // Trusted injected compatibility ports only; production repository supplies paging.
      yield deduplicateRetentionCandidates(
        await dependencies.candidates.listCandidates(actor, {
          asOf: input.asOf,
        }),
      );
      return;
    }
    let cursor: string | null = null;
    const visited = new Set<string>();
    do {
      const page = await dependencies.candidates.listCandidatePage(actor, {
        asOf: input.asOf,
        cursor,
        limit: 100,
      });
      yield page.items;
      cursor = page.nextCursor;
      if (cursor) {
        if (visited.has(cursor)) throw Error("RETENTION_CURSOR_NOT_ADVANCING");
        visited.add(cursor);
      }
    } while (cursor);
  }

  async function processCandidate(candidate: Candidate): Promise<void> {
    let claim: DraftWorkClaim | undefined,
      started = false,
      receipt: string | null = null;
    try {
      const pending =
        "pending" in candidate
          ? candidate.pending
          : await dependencies.approvals.hasPendingRetentionOutreach(
              actor,
              candidate.profileId,
            );
      if (pending) {
        summary.skippedPending++;
        return;
      }
      const work = dependencies.work;
      if (
        work &&
        (!("factsHash" in candidate) ||
          !dependencies.candidates.getCurrentCandidate)
      )
        throw Error("RETENTION_FACTS_PORT_REQUIRED");
      const version = [
        RETENTION_GROUNDED_PROMPT_VERSION,
        input.agentConfig.model,
        AI_PRICING_VERSION,
      ].join(":");
      const requestKey = work
        ? "retention:" +
          createHash("sha256")
            .update(
              JSON.stringify({
                profileId: candidate.profileId,
                factsHash:
                  "factsHash" in candidate ? candidate.factsHash : null,
                version,
              }),
            )
            .digest("hex")
        : requestKeyFor(candidate, input.asOf);
      if (work) {
        claim = await work.claimDraftWork({
          kind: "renewal",
          caseId: candidate.profileId,
          factsHash: "factsHash" in candidate ? candidate.factsHash : null,
          agentVersion: version,
          idempotencyKey: requestKey,
        });
        if (claim.disposition === "reuse") {
          summary.deduplicated++;
          return;
        }
        if (claim.disposition === "busy") return;
        if (claim.disposition === "unknown")
          throw Error("RETENTION_PROVIDER_EFFECT_UNKNOWN");
        if (!claim.claimToken) throw Error("RETENTION_CLAIM_REQUIRED");
      }
      const agentActor = scheduledActor(
        claim?.runId ?? dependencies.createRunId(),
      );
      await dependencies.agentRuns.start(agentActor, {
        provider: null,
        model: null,
        startedAt: input.asOf,
        ...(input.acceptanceOwnershipKey
          ? { acceptanceOwnershipKey: input.acceptanceOwnershipKey }
          : {}),
      });
      const assertCurrent = async () => {
        if (!work) return;
        const current = await dependencies.candidates.getCurrentCandidate!(
          actor,
          { profileId: candidate.profileId, asOf: input.asOf },
        );
        if (
          !current ||
          current.pending ||
          !("factsHash" in candidate) ||
          current.factsHash !== candidate.factsHash
        )
          throw Error("RETENTION_FACTS_STALE");
      };
      let approvalResult: { approvalId: string; created: boolean } | undefined;
      await dependencies.runJson({
        actor: agentActor,
        agentConfig: input.agentConfig,
        prompt: work
          ? buildGroundedRetentionPrompt(candidate)
          : buildRetentionDraftPrompt(candidate),
        outputSchema: retentionDraftSchema,
        ...(work
          ? {
              beforeDispatch: async () => {
                await assertCurrent();
                await work.markDraftRequestStarted({
                  runId: claim!.runId,
                  claimToken: claim!.claimToken,
                });
                started = true;
              },
              onProviderReceipt: async (requestId: string) => {
                receipt = requestId;
                await work.recordDraftProviderReceipt({
                  runId: claim!.runId,
                  claimToken: claim!.claimToken,
                  providerRequestId: requestId,
                });
              },
            }
          : {}),
        commit: async (draft) => {
          if (work && (!started || !receipt))
            throw Error("RETENTION_PROVIDER_RECEIPT_REQUIRED");
          await assertCurrent();
          const validated = work
            ? validateRetentionDraft(draft, candidate, input.asOf)
            : draft;
          approvalResult =
            await dependencies.approvals.createRetentionOutreachOnce(
              agentActor,
              {
                requestKey,
                profileId: candidate.profileId,
                membershipId: candidate.membershipId,
                locale: candidate.locale,
                reasonCodes: candidate.riskCodes,
                subject: validated.subject,
                body: validated.body,
                ...(work && "factsHash" in candidate
                  ? {
                      factsHash: candidate.factsHash,
                      planCode: candidate.planCode,
                      renewalDate: candidate.renewalDate,
                    }
                  : {}),
              },
            );
        },
      });
      if (!approvalResult) throw Error("RETENTION_ANALYST_COMMIT_NOT_RUN");
      if (work)
        await work.finishDraftWork({
          runId: claim!.runId,
          claimToken: claim!.claimToken,
          state: "succeeded",
          draftId: null,
          approvalId: approvalResult.approvalId,
          providerRequestId: receipt,
        });
      if (approvalResult.created) summary.drafted++;
      else summary.deduplicated++;
    } catch {
      if (
        dependencies.work &&
        claim?.disposition === "claimed" &&
        claim.claimToken
      ) {
        try {
          await dependencies.work.finishDraftWork({
            runId: claim.runId,
            claimToken: claim.claimToken,
            state: started ? "unknown" : "failed_before_request",
            draftId: null,
            providerRequestId: started ? receipt : null,
          });
        } catch {
          /* Preserve the existing conservative claim if its acknowledgement or finalization is uncertain. */
        }
      }
      summary.failed++;
    }
  }

  for await (const candidates of pages()) {
    summary.considered += candidates.length;
    let nextCandidate = 0;
    async function worker(): Promise<void> {
      while (nextCandidate < candidates.length) {
        const candidate = candidates[nextCandidate++];
        if (candidate) await processCandidate(candidate);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, candidates.length) }, () =>
        worker(),
      ),
    );
  }
  if (summary.failed > 0) {
    throw new Error("RETENTION_ANALYST_CANDIDATE_FAILED");
  }
  return summary;
}
