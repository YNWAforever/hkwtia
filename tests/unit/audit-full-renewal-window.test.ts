import { describe, expect, it, vi } from "vitest";
import { automationCronActor } from "@/lib/auth/automation-actor";
import { renewalRunLimits } from "@/lib/automation/renewal-window";
import { runRenewalReconciliation } from "@/lib/automation/renewal-runner";
const actor = automationCronActor();
describe("renewal server window", () => {
  it("keeps personal and company memberships with the same profile/period as independent episodes", async () => {
    const end = new Date("2040-01-20T00:00:00Z"),
      keys = new Set<string>(),
      candidates = [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ].map((membershipId) => ({
        membershipId,
        profileId: "synthetic-applicant",
        billingPeriodEnd: end,
      }));
    const listDue = vi.fn(async () => ({
        items: candidates,
        nextCursor: null,
      })),
      enroll = vi.fn(async (_actor, step) => {
        if (keys.has(step.deliveryKey)) return "existing" as const;
        keys.add(step.deliveryKey);
        return "created" as const;
      });
    const result = await runRenewalReconciliation(
      actor,
      new Date("2040-01-01T16:00:00Z"),
      { renewals: { listDue }, journeys: { enroll } },
    );
    expect(result.createdSteps).toBe(8);
    expect(keys.size).toBe(8);
  });
  it("derives a bounded Hong Kong calendar window from the existing90-day lead", async () => {
    const listDue = vi.fn(async () => ({ items: [], nextCursor: null })),
      enroll = vi.fn(async () => "existing" as const);
    await runRenewalReconciliation(
      actor,
      new Date("2040-01-01T15:59:59.999Z"),
      { renewals: { listDue }, journeys: { enroll } },
    );
    expect(listDue).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        from: new Date("2039-12-31T16:00:00Z"),
        to: new Date("2040-03-31T16:00:00Z"),
        statuses: ["active", "past_due"],
        after: null,
        limit: 250,
      }),
    );
    expect(enroll).not.toHaveBeenCalled();
  });
  it("stops at the time/page budget with a durable remainder for the next poll", async () => {
    const candidate = {
      membershipId: "11111111-1111-4111-8111-111111111111",
      profileId: "synthetic",
      billingPeriodEnd: new Date("2040-01-20T00:00:00Z"),
    };
    const listDue = vi.fn(async () => ({
        items: [candidate],
        nextCursor: {
          membershipId: candidate.membershipId,
          billingPeriodEnd: candidate.billingPeriodEnd,
        },
      })),
      enroll = vi.fn(async () => "created" as const);
    let tick = 0;
    const result = await runRenewalReconciliation(
      actor,
      new Date("2040-01-01T16:00:00Z"),
      {
        renewals: { listDue },
        journeys: { enroll },
        elapsedNow: () => (tick++ === 0 ? 0 : 7000),
      },
    );
    expect(result).toMatchObject({
      scanned: 1,
      createdSteps: 4,
      pages: 1,
      deferred: true,
    });
    expect(listDue).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed or excessive operational limits", () => {
    expect(renewalRunLimits({})).toEqual({
      pageSize: 250,
      maxPages: 20,
      budgetMs: 6000,
    });
    for (const raw of ["", "0", "501", "1.5", "NaN"])
      expect(() =>
        renewalRunLimits({ RENEWAL_ENROLLMENT_PAGE_SIZE: raw }),
      ).toThrow("INVALID_RENEWAL_RUN_LIMIT");
    expect(() =>
      renewalRunLimits({ RENEWAL_ENROLLMENT_BUDGET_MS: "7001" }),
    ).toThrow("INVALID_RENEWAL_RUN_LIMIT");
  });
  it("rejects webhook actors before any renewal read", async () => {
    const listDue = vi.fn(async () => ({ items: [], nextCursor: null })),
      enroll = vi.fn(async () => "existing" as const);
    await expect(
      runRenewalReconciliation(
        { kind: "system", userId: null, source: "stripe-webhook" },
        new Date(),
        { renewals: { listDue }, journeys: { enroll } },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listDue).not.toHaveBeenCalled();
  });
});
