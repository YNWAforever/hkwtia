import {z} from "zod";

import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {
  AgentRuntimeError,
  type AgentRuntimeActorInput,
  type createAgentRuntime,
} from "@/lib/ai/runtime";

type ScheduledRuntime = Pick<
  ReturnType<typeof createAgentRuntime>,
  "adoptPrestarted" | "stream"
>;

export type AgentConfig = Readonly<{
  enabled: boolean;
  model: string;
  credentials: Readonly<{
    openaiApiKey?: string;
    anthropicApiKey?: string;
  }>;
  system: string;
  runtime: ScheduledRuntime;
}>;

function runtimeActorFor(actor: ScheduledAgentActor): AgentRuntimeActorInput {
  return {
    agent: actor.agent,
    conversationId: null,
    profileId: null,
    trigger: "scheduled",
  };
}

function invalidProviderResponse(): AgentRuntimeError {
  return new AgentRuntimeError("invalid_provider_response");
}

export async function runScheduledJson<T>(input: {
  actor: ScheduledAgentActor;
  agentConfig: AgentConfig;
  prompt: string;
  outputSchema: z.ZodType<T>;
  signal?: AbortSignal;
  commit?: (output: T) => Promise<void>;
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

    try {
      await input.commit?.(output);
    } catch {
      throw new AgentRuntimeError("tool_error");
    }

    await result.finalize();
    return output;
  } catch (error) {
    const runtimeError = error instanceof AgentRuntimeError
      ? error
      : invalidProviderResponse();
    throw await result.fail(runtimeError);
  }
}
