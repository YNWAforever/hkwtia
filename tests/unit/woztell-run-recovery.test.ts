import {describe, expect, it} from "vitest";

import {decideWoztellRunRecovery} from "@/lib/ai/woztell-webhook";

describe("WOZTELL deterministic Concierge run recovery", () => {
  it("resumes only a genuinely pre-provider running run", () => {
    expect(decideWoztellRunRecovery({
      run: {status: "running", provider: null, model: null},
      persistedAssistantReply: null,
    })).toEqual({status: "resume_pre_provider"});
  });

  it.each([
    {
      name: "configured provider",
      run: {status: "running" as const, provider: "openai", model: "gpt-5"},
    },
    {
      name: "potential tool execution",
      run: {status: "running" as const, provider: "anthropic", model: "claude-sonnet"},
    },
    {
      name: "failed terminal run",
      run: {status: "failed" as const, provider: "openai", model: "gpt-5"},
    },
  ])("escalates a non-resumable ambiguous run after $name", ({run}) => {
    expect(decideWoztellRunRecovery({
      run,
      persistedAssistantReply: null,
    })).toEqual({status: "escalate_ambiguous"});
  });

  it("reconstructs reply-ready after run success and assistant persistence", () => {
    expect(decideWoztellRunRecovery({
      run: {status: "completed", provider: "openai", model: "gpt-5"},
      persistedAssistantReply: "Persisted answer",
    })).toEqual({status: "reply_ready", reply: "Persisted answer"});
  });

  it("does not replay a successful run whose assistant persistence is missing", () => {
    expect(decideWoztellRunRecovery({
      run: {status: "completed", provider: "openai", model: "gpt-5"},
      persistedAssistantReply: null,
    })).toEqual({status: "escalate_ambiguous"});
  });
});
