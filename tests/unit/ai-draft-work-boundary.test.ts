// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createDraftWorkRepository } from "@/lib/db/repos/ai-draft-work";
describe("draft-work read failures are not missing work", () => {
  it("rejects an invalid SQL result before inventing a new claim", async () => {
    const execute = vi.fn(async () => ({ rows: "unavailable" }));
    const repository = createDraftWorkRepository(
      async () => ({ execute, transaction: async (work) => work({ execute }) }),
      () => new Date("2040-01-01T00:00:00Z"),
    );
    await expect(
      repository.claimDraftWork({
        kind: "support",
        caseId: "synthetic-case",
        factsHash: "a".repeat(64),
        agentVersion: "v1",
        idempotencyKey: "synthetic",
      }),
    ).rejects.toThrow("DRAFT_WORK_SQL_RESULT_INVALID");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
