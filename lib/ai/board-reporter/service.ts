import "server-only";

import {randomUUID} from "node:crypto";

import {
  BOARD_REPORTER_AGENT_CONFIG,
} from "@/config/agents/board-reporter";
import {
  boardNarrativeSchema,
  buildBoardNarrativePrompt,
  type BoardFactPack,
  type BoardNarrative,
} from "@/lib/ai/board-reporter/contracts";
import {buildBoardFactPack} from "@/lib/ai/board-reporter/facts";
import {renderBoardReportMdx} from "@/lib/ai/board-reporter/render";
import {
  runScheduledJson,
  type AgentConfig,
} from "@/lib/ai/scheduled-runtime";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {
  requireAutomationCron,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {
  postsRepository,
  type BoardDraftInput,
} from "@/lib/db/repos/posts";

type BoardNarrativeRunInput = Readonly<{
  actor: ScheduledAgentActor;
  agentConfig: AgentConfig;
  prompt: string;
  outputSchema: typeof boardNarrativeSchema;
}>;

export type BoardReporterResult = Readonly<{
  reportMonth: string;
  postId: string;
  created: boolean;
  metricCount: number;
}>;

export type BoardReporterServiceDependencies = Readonly<{
  buildFactPack: (
    actor: ScheduledAgentActor,
    asOf: Date,
  ) => Promise<BoardFactPack>;
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
  runJson: (input: BoardNarrativeRunInput) => Promise<BoardNarrative>;
  posts: Readonly<{
    createBoardDraftOnce: (
      actor: ScheduledAgentActor,
      input: BoardDraftInput,
    ) => Promise<{postId: string; created: boolean}>;
  }>;
  createRunId: () => string;
}>;

const defaultDependencies: BoardReporterServiceDependencies = {
  buildFactPack: (actor, asOf) => buildBoardFactPack(actor, asOf),
  agentRuns: agentRunsRepository,
  runJson: (input) => runScheduledJson(input),
  posts: postsRepository,
  createRunId: randomUUID,
};

function scheduledActor(runId: string): ScheduledAgentActor {
  return {
    kind: "agent",
    agent: "board_reporter",
    runId,
    conversationId: null,
    profileId: null,
    trigger: "scheduled",
  };
}

function sourceKey(reportMonth: string): string {
  return [
    "board-report",
    reportMonth,
    BOARD_REPORTER_AGENT_CONFIG.version,
  ].join(":");
}

export async function runBoardReporter(
  actor: AutomationCronActor,
  input: Readonly<{
    asOf: Date;
    agentConfig: AgentConfig;
    acceptanceOwnershipKey?: string;
  }>,
  dependencies: BoardReporterServiceDependencies = defaultDependencies,
): Promise<BoardReporterResult | null> {
  requireAutomationCron(actor);
  if (!input.agentConfig.enabled) return null;

  const agentActor = scheduledActor(dependencies.createRunId());
  const factPack = await dependencies.buildFactPack(agentActor, input.asOf);
  await dependencies.agentRuns.start(agentActor, {
    provider: null,
    model: null,
    startedAt: input.asOf,
    ...(input.acceptanceOwnershipKey
      ? {acceptanceOwnershipKey: input.acceptanceOwnershipKey}
      : {}),
  });
  const narrative = await dependencies.runJson({
    actor: agentActor,
    agentConfig: input.agentConfig,
    prompt: buildBoardNarrativePrompt(factPack),
    outputSchema: boardNarrativeSchema,
  });
  const bodyMdx = renderBoardReportMdx({
    factPack,
    narrative,
    agentRunId: agentActor.runId,
  });
  const reportMonth = factPack.reportMonth;
  const post = await dependencies.posts.createBoardDraftOnce(agentActor, {
    sourceKey: sourceKey(reportMonth),
    slug: `board-report-${reportMonth}`,
    titleEn: `Board report: ${reportMonth}`,
    titleZh: `Board report: ${reportMonth}`,
    bodyMdx,
  });

  return {
    reportMonth,
    postId: post.postId,
    created: post.created,
    metricCount: factPack.metrics.length,
  };
}
