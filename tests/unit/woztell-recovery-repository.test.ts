import {describe, expect, it, vi} from "vitest";

import {
  createWoztellRunRecoveryRepository,
} from "@/lib/db/repos/woztell-run-recovery";

describe("WOZTELL run recovery repository", () => {
  it("reconstructs a completed run only from its correlated assistant reply", async () => {
    const execute = vi.fn(async () => ({rows: [{
      status: "completed",
      provider: "openai",
      model: "gpt-5",
      assistant_reply: "Persisted answer",
    }]}));
    const repository = createWoztellRunRecoveryRepository(
      async () => ({execute}),
    );

    await expect(repository.recoverRun(
      "wamid.recovery",
      "11111111-1111-4111-8111-111111111111",
    )).resolves.toEqual({
      status: "reply_ready",
      reply: "Persisted answer",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("classifies an already configured running run as ambiguous", async () => {
    const execute = vi.fn(async () => ({rows: [{
      status: "running",
      provider: "openai",
      model: "gpt-5",
      assistant_reply: null,
    }]}));
    const repository = createWoztellRunRecoveryRepository(
      async () => ({execute}),
    );

    await expect(repository.recoverRun(
      "wamid.configured",
      "11111111-1111-4111-8111-111111111111",
    )).resolves.toEqual({status: "escalate_ambiguous"});
  });
});
