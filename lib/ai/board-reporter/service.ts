import "server-only";

import {randomUUID} from "node:crypto";

import {
  BOARD_REPORTER_AGENT_CONFIG,
} from "@/config/agents/board-reporter";
import {
  bilingualBoardNarrativeSchema,

  type BoardFactPack,
  type BilingualBoardNarrative,
} from "@/lib/ai/board-reporter/contracts";
import {groundedBoardPrompt, validateBoardNarratives, boardApprovedFacts} from "./grounding";
import {boardReportLabels} from "./render";
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
import {AI_PRICING_VERSION} from "@/config/ai-pricing";
import {draftWorkRepository, type DraftWorkClaim} from "@/lib/db/repos/ai-draft-work";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {
  postsRepository,
  type BoardDraftInput,
} from "@/lib/db/repos/posts";

type BoardNarrativeRunInput = Readonly<{
  actor: ScheduledAgentActor;
  agentConfig: AgentConfig;
  prompt: string;
  outputSchema: typeof bilingualBoardNarrativeSchema;
  beforeDispatch?: () => Promise<void>;
  onProviderReceipt?: (requestId: string) => Promise<void>;
  commit?: (output: BilingualBoardNarrative) => Promise<void>;
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
  runJson: (input: BoardNarrativeRunInput) => Promise<BilingualBoardNarrative>;
  work?: Pick<typeof draftWorkRepository, "claimDraftWork" | "markDraftRequestStarted" | "recordDraftProviderReceipt" | "finishDraftWork">;
  posts: Readonly<{
    getBoardDraftBySourceKey?: typeof postsRepository.getBoardDraftBySourceKey;
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
  work: draftWorkRepository,
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

  const readActor = scheduledActor(dependencies.createRunId());
  const factPack = await dependencies.buildFactPack(readActor, input.asOf);
  const reportMonth = factPack.reportMonth, key = sourceKey(reportMonth);
  const factsHash = boardApprovedFacts(factPack, "en", input.asOf).versionHash;
  const existing = await dependencies.posts.getBoardDraftBySourceKey?.(readActor, key);
  if(existing?.completed === false) throw Error("BOARD_PROVIDER_EFFECT_UNKNOWN");
  if (existing) return {reportMonth, postId:existing.postId, created:false, metricCount:factPack.metrics.length};
  const work = dependencies.work;
  let claim: DraftWorkClaim | undefined, started=false, receipt:string|null=null;
  if(work) {
    claim = await work.claimDraftWork({kind:"board",caseId:reportMonth,factsHash,agentVersion:["board-grounded-v2",input.agentConfig.model,AI_PRICING_VERSION].join(":"),idempotencyKey:key});
    if(claim.disposition === "reuse" && claim.postId) return {reportMonth,postId:claim.postId,created:false,metricCount:factPack.metrics.length};
    if(claim.disposition === "busy") return null;
    if(claim.disposition !== "claimed" || !claim.claimToken) throw Error("BOARD_PROVIDER_EFFECT_UNKNOWN");
  }
  const agentActor=scheduledActor(claim?.runId ?? readActor.runId);
  const assertCurrent=async()=>{
    if(!work) return;
    const saved=await dependencies.posts.getBoardDraftBySourceKey?.(agentActor,key);
    if(saved)throw Error("BOARD_RESULT_RECONCILIATION_REQUIRED");
    const current=await dependencies.buildFactPack(agentActor,input.asOf);
    if(boardApprovedFacts(current,"en",input.asOf).versionHash!==factsHash)throw Error("BOARD_FACTS_STALE");
  };
  let post:{postId:string;created:boolean}|undefined;
  try {
    await dependencies.agentRuns.start(agentActor, {provider:null,model:null,startedAt:input.asOf,...(input.acceptanceOwnershipKey ? {acceptanceOwnershipKey:input.acceptanceOwnershipKey} : {})});
    await dependencies.runJson({actor:agentActor,agentConfig:input.agentConfig,prompt:groundedBoardPrompt(factPack,input.asOf),outputSchema:bilingualBoardNarrativeSchema,
      ...(work ? {beforeDispatch:async()=>{await assertCurrent();await work.markDraftRequestStarted({runId:claim!.runId,claimToken:claim!.claimToken});started=true;},onProviderReceipt:async(requestId:string)=>{receipt=requestId;await work.recordDraftProviderReceipt({runId:claim!.runId,claimToken:claim!.claimToken,providerRequestId:requestId});}} : {}),
      commit:async(narrative)=>{
        if(work && (!started || !receipt))throw Error("BOARD_PROVIDER_RECEIPT_REQUIRED");
        await assertCurrent();
        const validated=validateBoardNarratives(narrative,factPack,input.asOf);
        post=await dependencies.posts.createBoardDraftOnce(agentActor,{sourceKey:key,slug:`board-report-${reportMonth}`,titleEn:`${boardReportLabels("en").title}: ${reportMonth}`,titleZh:`${boardReportLabels("zh-HK").title}: ${reportMonth}`,bodyMdx:renderBoardReportMdx({factPack,narrative:validated.en,agentRunId:agentActor.runId}),bodyMdxZhHk:renderBoardReportMdx({factPack,narrative:validated.zhHK,agentRunId:agentActor.runId,locale:"zh-HK"})});
      },
    });
    if(!post)throw Error("BOARD_REPORTER_COMMIT_NOT_RUN");
    if(work)await work.finishDraftWork({runId:claim!.runId,claimToken:claim!.claimToken,state:"succeeded",draftId:null,postId:post.postId,providerRequestId:receipt});
    return {reportMonth,postId:post.postId,created:post.created,metricCount:factPack.metrics.length};
  } catch(error) {
    if(work && claim?.disposition === "claimed" && claim.claimToken)try{await work.finishDraftWork({runId:claim.runId,claimToken:claim.claimToken,state:started?"unknown":"failed_before_request",draftId:null,providerRequestId:started?receipt:null});}catch{/* Keep the conservative claim when acknowledgement is uncertain. */}
    throw error;
  }
}
