import {z} from "zod";

import type {WriterAgentActor} from "@/lib/auth/agent-actor";
import {aiEnv} from "@/lib/config/env";
import {
  AgentRuntimeError,
  createAgentRuntime,
  type AgentRuntimeActorInput,
} from "@/lib/ai/runtime";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import type {Actor} from "@/lib/membership/lifecycle";
import {
  writerOutputSchema,
  type WriterKind,
  type WriterOutput,
} from "@/lib/ai/writers/contracts";
import {writerSystemPrompt} from "@/config/agents/writer";

type WriterRuntime = Pick<
  ReturnType<typeof createAgentRuntime>,
  "adoptPrestarted" | "stream"
>;

export type WriterAgentConfig = Readonly<{
  enabled: boolean;
  model: string;
  credentials: Readonly<{
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }>;
  system: string;
  runtime: WriterRuntime;
}>;

function runtimeActorFor(actor: WriterAgentActor): AgentRuntimeActorInput {
  return {
    agent: "writer",
    conversationId: null,
    profileId: actor.profileId,
    trigger: "portal",
  };
}

function invalidProviderResponse(): AgentRuntimeError {
  return new AgentRuntimeError("invalid_provider_response");
}

/** One step, no tools, strict JSON — the shape `runScheduledJson` uses. */
export async function runWriterJson<T>(input: {
  actor: WriterAgentActor;
  agentConfig: WriterAgentConfig;
  prompt: string;
  outputSchema: z.ZodType<T>;
  signal?: AbortSignal;
}): Promise<T> {
  const runtimeActor = runtimeActorFor(input.actor);
  const preparedRun = input.agentConfig.runtime.adoptPrestarted(
    runtimeActor,
    input.actor.runId,
  );
  const result = await input.agentConfig.runtime.stream({
    enabled: input.agentConfig.enabled,
    model: input.agentConfig.model,
    credentials: input.agentConfig.credentials,
    actor: runtimeActor,
    system: input.agentConfig.system,
    messages: [{role: "user", content: input.prompt}],
    tools: {},
    preparedRun,
    finalization: "deferred",
    ...(input.signal === undefined ? {} : {abortSignal: input.signal}),
  });

  try {
    let jsonText = "";
    for await (const delta of result.textStream) jsonText += delta;

    const finish = await result.finish;
    if (
      finish.status !== "completed"
      || finish.finishReason === "tool-calls"
      || finish.citations.length > 0
    ) {
      throw invalidProviderResponse();
    }

    let json: unknown;
    try {
      json = JSON.parse(jsonText);
    } catch {
      throw invalidProviderResponse();
    }

    let output: T;
    try {
      output = input.outputSchema.parse(json);
    } catch {
      throw invalidProviderResponse();
    }

    await result.finalize();
    return output;
  } catch (error) {
    throw await result.fail(
      error instanceof AgentRuntimeError ? error : invalidProviderResponse(),
    );
  }
}

type MemberActor = Extract<Actor, {kind: "member"}>;

export type WriterDependencies = Readonly<{
  runtime: WriterRuntime;
  credentials: WriterAgentConfig["credentials"];
  enabled: boolean;
  model: string;
}>;

function defaultDependencies(): WriterDependencies {
  const ai = aiEnv();
  return {
    runtime: createAgentRuntime({agentRuns: agentRunsRepository}),
    credentials: {
      ...(ai.openaiApiKey === undefined ? {} : {openaiApiKey: ai.openaiApiKey}),
      ...(ai.anthropicApiKey === undefined ? {} : {anthropicApiKey: ai.anthropicApiKey}),
    },
    enabled: ai.agentsEnabled,
    model: ai.agentModelWriter,
  };
}

/**
 * Generate copy for one surface using the run reserved by the quota repository
 * before any provider request. A crash mid-stream leaves a `running` row. Run one
 * step and returns the parsed copy. Nothing is persisted beyond the run row —
 * the caller puts the text in a form the member must still save.
 */
export async function generateWriterCopy(input: {
  memberActor: MemberActor;
  runId: string;
  kind: WriterKind;
  brief: string;
  dependencies?: Partial<WriterDependencies>;
}): Promise<WriterOutput[WriterKind]> {
  const deps: WriterDependencies = {...defaultDependencies(), ...input.dependencies};
  const actor: WriterAgentActor = {
    kind: "agent",
    agent: "writer",
    runId: input.runId,
    conversationId: null,
    profileId: input.memberActor.profileId,
    trigger: "portal",
  };
  const agentConfig: WriterAgentConfig = {
    enabled: deps.enabled,
    model: deps.model,
    credentials: deps.credentials,
    system: writerSystemPrompt(input.kind),
    runtime: deps.runtime,
  };
  // Dispatch per kind rather than indexing the schema map: `writerOutputSchema`
  // is a union of three schemas, and passing that union to `runWriterJson`'s
  // `z.ZodType<T>` parameter makes inference fix T to the first member and then
  // reject the other two. A branch per kind keeps each call's output type exact
  // with no assertion.
  switch (input.kind) {
    case "profile":
      return runWriterJson({actor, agentConfig, prompt: input.brief, outputSchema: writerOutputSchema.profile});
    case "listing":
      return runWriterJson({actor, agentConfig, prompt: input.brief, outputSchema: writerOutputSchema.listing});
    case "event":
      return runWriterJson({actor, agentConfig, prompt: input.brief, outputSchema: writerOutputSchema.event});
  }
}
