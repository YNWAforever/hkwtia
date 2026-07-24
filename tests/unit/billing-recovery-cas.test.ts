import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {membershipsRepository} from "@/lib/db/repos/memberships";

const actor = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
const membershipId = "20000000-0000-4000-8000-000000000002";
const expectedId = "30000000-0000-4000-8000-000000000003";
const replacementId = "40000000-0000-4000-8000-000000000004";
const now = new Date("2026-01-01T00:00:00.000Z");
const replacementRow = [replacementId, membershipId, 2, `membership-checkout:${membershipId}:2`,
  "price_startup_v1", "active", null, null, "recovery-1", now, now, null];
const lockedMembership = {id: membershipId, owner_user_id: "user-a", company_id: null,
  application_id: "10000000-0000-4000-8000-000000000001", plan_code: "startup",
  status: "pending_payment", seat_limit: 5};
const request = {expectedCurrentAttemptId: expectedId, recoveryRequestId: "recovery-1"};

function sqlText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if ("value" in value && Array.isArray((value as {value?: unknown}).value)) {
    return ((value as {value: unknown[]}).value).join("");
  }
  if ("queryChunks" in value && Array.isArray((value as {queryChunks?: unknown}).queryChunks)) {
    return (value as {queryChunks: unknown[]}).queryChunks.map(sqlText).join(" ");
  }
  return "";
}

function transactionDatabase(responses: unknown[][], statements: string[]) {
  return {transaction: async (work: (tx: {execute: (query: unknown) => Promise<{rows: unknown[]}>}) => Promise<unknown>) => {
    let index = 0;
    return work({execute: async (query) => {
      statements.push(sqlText(query));
      return {rows: responses[index++] ?? []};
    }});
  }};
}

describe("serialized checkout recovery CAS", () => {
  beforeEach(() => { database.current = null; vi.restoreAllMocks(); });

  it("returns the same replacement for a duplicate recovery request token", async () => {
    const statements: string[] = [];
    database.current = transactionDatabase([[lockedMembership], [replacementRow]], statements);
    const result = await billingAttemptsRepository.startNewAttempt(actor, membershipId, "price_startup_v1", "expired", request);
    expect(result.attempt.id).toBe(replacementId);
    expect(statements).toHaveLength(2);
    expect(statements.join("\n").toLowerCase()).not.toContain("update ");
    expect(statements.join("\n").toLowerCase()).not.toContain("insert ");
  });

  it("rejects a stale different-token CAS without ending the new active attempt", async () => {
    const statements: string[] = [];
    const newer = [...replacementRow];
    database.current = transactionDatabase([[lockedMembership], [], [newer]], statements);
    await expect(billingAttemptsRepository.startNewAttempt(actor, membershipId, "price_startup_v1", "expired",
      {expectedCurrentAttemptId: expectedId, recoveryRequestId: "recovery-other"}))
      .rejects.toThrow("BILLING_ATTEMPT_STALE");
    expect(statements.join("\n").toLowerCase()).not.toMatch(/update |insert /);
  });

  it("locks membership then orders compare, update, and insert inside one transaction", async () => {
    const statements: string[] = [];
    const current = [...replacementRow]; current[0] = expectedId; current[2] = 1;
    database.current = transactionDatabase([[lockedMembership], [], [current], [{id: expectedId}], [replacementRow]], statements);
    await expect(billingAttemptsRepository.startNewAttempt(actor, membershipId, "price_startup_v1", "abandoned", request))
      .resolves.toMatchObject({attempt: {id: replacementId, recoveryRequestId: "recovery-1"}});
    const query = statements.map((value) => value.toLowerCase());
    expect(query[0]).toContain("for update");
    expect(query.findIndex((value) => value.includes("update ")))
      .toBeLessThan(query.findIndex((value) => value.includes("insert ")));
  });

  it("denies the webhook system actor from checkout-attempt APIs", async () => {
    vi.spyOn(membershipsRepository, "getById").mockResolvedValue(null);
    const attach = {stripeCheckoutSessionId: "cs_1", checkoutUrl: "https://checkout.test/cs_1"};
    await expect(billingAttemptsRepository.getActive(system, membershipId)).rejects.toThrow("FORBIDDEN");
    await expect(billingAttemptsRepository.claimActive(system, membershipId, "price_1")).rejects.toThrow("FORBIDDEN");
    await expect(billingAttemptsRepository.attachSession(system, expectedId, attach)).rejects.toThrow("FORBIDDEN");
    await expect(billingAttemptsRepository.startNewAttempt(system, membershipId, "price_1", "expired", request)).rejects.toThrow("FORBIDDEN");
    expect(database.current).toBeNull();
  });
});
