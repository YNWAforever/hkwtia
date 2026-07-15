import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";

const actor = {kind: "member", userId: "user-a"} as const;
const membershipId = "20000000-0000-4000-8000-000000000002";
const attemptId = "30000000-0000-4000-8000-000000000003";
const now = new Date("2026-01-01T00:00:00.000Z");
const eligible = {
  id: membershipId, owner_user_id: "user-a", company_id: null,
  application_id: "10000000-0000-4000-8000-000000000001",
  plan_code: "startup", status: "pending_payment", seat_limit: 5,
  stripe_customer_id: null, stripe_subscription_id: null,
  billing_period_start: null, billing_period_end: null,
};
const attempt = {
  id: attemptId, membership_id: membershipId, attempt_number: 1,
  idempotency_key: `membership-checkout:${membershipId}:1`, price_reference: "price_startup_v1",
  state: "active", stripe_checkout_session_id: null, checkout_url: null,
  recovery_request_id: null, created_at: now, updated_at: now, ended_at: null,
};

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

function scripted(responses: unknown[][], statements: string[]) {
  return {
    transaction: async (work: (tx: {execute: (query: unknown) => Promise<{rows: unknown[]}>}) => Promise<unknown>) => {
      let index = 0;
      return work({execute: async (query) => {
        statements.push(sqlText(query));
        return {rows: responses[index++] ?? []};
      }});
    },
  };
}

describe("locked checkout eligibility", () => {
  beforeEach(() => { database.current = null; });

  it.each(["ordinary", "revoked"])("denies an %s company member before attempt insertion", async () => {
    const statements: string[] = [];
    database.current = scripted([[]], statements);
    await expect(billingAttemptsRepository.claimActive(actor, membershipId, "price_startup_v1"))
      .rejects.toThrow("FORBIDDEN");
    expect(statements).toHaveLength(1);
    expect(statements[0].toLowerCase()).toContain("for update");
    expect(statements.join("\n").toLowerCase()).not.toContain("insert into");
  });

  it.each(["owner", "admin"])("allows an active company %s through the trusted locked scope", async () => {
    const statements: string[] = [];
    database.current = scripted([[eligible], [], [], [attempt]], statements);
    await expect(billingAttemptsRepository.claimActive(actor, membershipId, "price_startup_v1"))
      .resolves.toMatchObject({attempt: {id: attemptId}});
    const lock = statements[0].toLowerCase();
    expect(lock).toContain("for update");
    expect(lock).toContain("is null");
    expect(lock).toContain("owner");
    expect(lock).toContain("admin");
  });

  it.each(["claim", "recovery"] as const)("rejects lifecycle change to active inside the lock before %s mutation", async (operation) => {
    const statements: string[] = [];
    database.current = scripted([[{...eligible, status: "active"}]], statements);
    const result = operation === "claim"
      ? billingAttemptsRepository.claimActive(actor, membershipId, "price_startup_v1")
      : billingAttemptsRepository.startNewAttempt(actor, membershipId, "price_startup_v1", "expired", {
          expectedCurrentAttemptId: attemptId, recoveryRequestId: "recovery-race",
        });
    await expect(result).rejects.toThrow("MEMBERSHIP_NOT_PENDING_PAYMENT");
    expect(statements).toHaveLength(1);
    expect(statements.join("\n").toLowerCase()).not.toMatch(/update |insert into/);
  });

  it("orders initial lock, active lookup, prior lookup, and insert in one transaction", async () => {
    const statements: string[] = [];
    database.current = scripted([[eligible], [], [], [attempt]], statements);
    await billingAttemptsRepository.claimActive(actor, membershipId, "price_startup_v1");
    const sql = statements.map((value) => value.toLowerCase());
    expect(sql[0]).toContain("for update");
    expect(sql.findIndex((value) => value.includes("state") && value.includes("active")))
      .toBeLessThan(sql.findIndex((value) => value.includes("insert into")));
  });
});
