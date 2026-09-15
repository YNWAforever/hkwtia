import {describe, expect, it, vi} from "vitest";

import {writerQuotaFor, type WriterActionDependencies} from "@/lib/portal/writer-action-core";

const member = {kind: "member", userId: "u1", profileId: "profile-1"} as const;
const now = new Date("2026-09-14T04:00:00Z");

function deps(overrides: Partial<WriterActionDependencies> = {}): WriterActionDependencies {
  return {
    plansFor: vi.fn(async () => ["startup"] as const),
    countRuns: vi.fn(async () => 5),
    generate: vi.fn(),
    now: () => now,
    ...overrides,
  };
}

describe("writerQuotaFor", () => {
  it("reports cap, used and remaining for the member's best plan", async () => {
    await expect(writerQuotaFor(member, deps())).resolves.toEqual({cap: 20, used: 5, remaining: 15});
  });

  it("does not read the run count when the plan has no allowance", async () => {
    const countRuns = vi.fn(async () => 0);
    await expect(writerQuotaFor(member, deps({plansFor: async () => ["community"], countRuns})))
      .resolves.toEqual({cap: 0, used: 0, remaining: 0});
    expect(countRuns).not.toHaveBeenCalled();
  });

  it("reports an unlimited plan without a finite remaining", async () => {
    const quota = await writerQuotaFor(member, deps({plansFor: async () => ["patron"], countRuns: async () => 5}));
    expect(quota.cap).toBe(Number.POSITIVE_INFINITY);
    expect(quota.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("never reports a negative remaining", async () => {
    await expect(writerQuotaFor(member, deps({countRuns: async () => 25})))
      .resolves.toEqual({cap: 20, used: 25, remaining: 0});
  });
});
