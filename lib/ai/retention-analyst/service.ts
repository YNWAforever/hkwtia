import "server-only";

import {randomUUID} from "node:crypto";

import {
  RETENTION_ANALYST_AGENT_CONFIG,
} from "@/config/agents/retention-analyst";
import {
  buildRetentionDraftPrompt,
  retentionDraftSchema,
  type RetentionDraft,
} from "@/lib/ai/retention-analyst/contracts";
import type {
  RetentionCandidate,
} from "@/lib/ai/retention-analyst/candidates";
import {
  runScheduledJson,
  type AgentConfig,
} from "@/lib/ai/scheduled-runtime";
import {hongKongDateKey} from "@/lib/automation/hong-kong-time";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {
  requireAutomationCron,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import {
  agentRunsRepository,
} from "@/lib/db/repos/agent-runs";
import {
  approvalsRepository,
  type RetentionOutreachApprovalInput,
} from "@/lib/db/repos/approvals";
import {
  retentionAnalystRepository,
} from "@/lib/db/repos/retention-analyst";

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
}>;

export type RetentionAnalystServiceDependencies = Readonly<{
  candidates: Readonly<{
    listCandidates: (
      actor: AutomationCronActor,
      input: Readonly<{asOf: Date}>,
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
    ) => Promise<{approvalId: string; created: boolean}>;
  }>;
  agentRuns: Readonly<{
    start: (
      actor: ScheduledAgentActor,
      input: Readonly<{
        provider: null;
        model: null;
        startedAt: Date;
      }>,
    ) => Promise<unknown>;
  }>;
  runJson: (input: RetentionDraftRunInput) => Promise<RetentionDraft>;
  createRunId: () => string;
}>;

const defaultDependencies: RetentionAnalystServiceDependencies = {
  candidates: retentionAnalystRepository,
  approvals: approvalsRepository,
  agentRuns: agentRunsRepository,
  runJson: (input) => runScheduledJson(input),
  createRunId: randomUUID,
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

  const candidates = [...await dependencies.candidates.listCandidates(actor, {
    asOf: input.asOf,
  })].sort((left, right) =>
    left.profileId.localeCompare(right.profileId)
    || left.membershipId.localeCompare(right.membershipId)
  );
  const summary: RetentionRunSummary = {
    ...emptySummary(),
    considered: candidates.length,
  };

  async function processCandidate(candidate: RetentionCandidate): Promise<void> {
    try {
      if (await dependencies.approvals.hasPendingRetentionOutreach(
        actor,
        candidate.profileId,
      )) {
        summary.skippedPending += 1;
        return;
      }
      const agentActor = scheduledActor(dependencies.createRunId());
      await dependencies.agentRuns.start(agentActor, {
        provider: null,
        model: null,
        startedAt: input.asOf,
      });
      const draft = await dependencies.runJson({
        actor: agentActor,
        agentConfig: input.agentConfig,
        prompt: buildRetentionDraftPrompt(candidate),
        outputSchema: retentionDraftSchema,
      });
      const approval = await dependencies.approvals.createRetentionOutreachOnce(
        agentActor,
        {
          requestKey: requestKeyFor(candidate, input.asOf),
          profileId: candidate.profileId,
          membershipId: candidate.membershipId,
          locale: candidate.locale,
          reasonCodes: candidate.riskCodes,
          subject: draft.subject,
          body: draft.body,
        },
      );
      if (approval.created) summary.drafted += 1;
      else summary.deduplicated += 1;
    } catch {
      summary.failed += 1;
    }
  }

  let nextCandidate = 0;
  async function worker(): Promise<void> {
    while (nextCandidate < candidates.length) {
      const index = nextCandidate;
      nextCandidate += 1;
      const candidate = candidates[index];
      if (candidate) await processCandidate(candidate);
    }
  }
  const workerCount = Math.min(3, candidates.length);
  await Promise.all(Array.from({length: workerCount}, () => worker()));
  return summary;
}
