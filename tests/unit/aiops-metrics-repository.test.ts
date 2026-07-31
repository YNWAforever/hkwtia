import {describe, expect, it, vi} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {aiopsMonthlyMetrics} from "@/lib/db/schema-core";
import {createAiOpsMetricsRepository} from "@/lib/db/repos/aiops-metrics";

describe("AI-Ops metrics refresh repository", () => {
  it("refreshes the exact materialized view concurrently for automation cron", async () => {
    const concurrently = vi.fn(async () => undefined);
    const refreshMaterializedView = vi.fn(() => ({concurrently}));
    const repository = createAiOpsMetricsRepository(async () => (
      {refreshMaterializedView} as never
    ));

    await expect(repository.refresh(automationCronActor())).resolves.toBeUndefined();

    expect(refreshMaterializedView).toHaveBeenCalledOnce();
    expect(refreshMaterializedView).toHaveBeenCalledWith(aiopsMonthlyMetrics);
    expect(concurrently).toHaveBeenCalledOnce();
  });

  it.each([
    {kind: "member", userId: "member-auth", profileId: "member-1"},
    {kind: "staff", userId: "staff-auth", profileId: "staff-1"},
    {kind: "system", userId: null, source: "stripe-webhook"},
    {
      kind: "agent",
      agent: "board_reporter",
      runId: "run-1",
      conversationId: null,
      profileId: null,
      trigger: "scheduled",
    },
  ] as const)("rejects $kind before loading the database", async (actor) => {
    const loadDatabase = vi.fn();
    const repository = createAiOpsMetricsRepository(loadDatabase);

    await expect(repository.refresh(actor as never)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});
