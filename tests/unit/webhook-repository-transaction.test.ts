import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {jobsRepository, WebhookCorrelationError} from "@/lib/db/repos/jobs";
import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {systemActor} from "@/lib/auth/actor";
import {applicationId, checkoutSessionId, customerId, membershipId, subscriptionId} from "@/tests/fixtures/stripe-events";

const command: WebhookLifecycleCommand = {
  eventId: "evt_transaction", eventType: "checkout.session.completed", eventCreated: 1_784_156_400,
  membershipId, applicationId, planCode: "startup", stripeCustomerId: customerId,
  stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId: checkoutSessionId,
  nextStatus: "active", billingPeriodStart: null, billingPeriodEnd: null, cancelAtPeriodEnd: false,
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

describe("production webhook transaction", () => {
  beforeEach(() => { database.current = null; });

  it("claims, locks, correlates, transitions, completes the exact attempt, audits, and completes the job atomically", async () => {
    const statements: string[] = [];
    database.current = {transaction: async (callback: (tx: {execute(query: unknown): Promise<unknown>}) => Promise<unknown>) => callback({
      execute: async (query) => { statements.push(sqlText(query)); return {rows: [{claimed: true, matched: true}]}; },
    })};
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).resolves.toBe("processed");
    expect(statements).toHaveLength(1);
    const sql = statements[0].toLowerCase();
    expect(sql).toContain("on conflict");
    expect(sql).toContain("locked_attempt as");
    expect(sql.match(/for update/g)).toHaveLength(2);
    expect(sql).toMatch(/locked_attempt as[\s\S]*checkout\.session\.completed[\s\S]*active[\s\S]*cs_test_m1_checkout[\s\S]*for update/);
    expect(sql).toContain("completed_attempt as");
    expect(sql).toMatch(/completed_attempt as[\s\S]*from updated[\s\S]*locked_attempt/);
    expect(sql).toContain("audited as");
    expect(sql).toContain("completed as");
    expect(sql).toContain("stripecreated");
    expect(sql).toMatch(/candidate as[\s\S]*<[^)]*stripe_created[\s\S]*matched as[\s\S]*stale[\s\S]*or[\s\S]*status/);
    expect(sql).toMatch(/locked_membership as[\s\S]*for update[\s\S]*latest_event as[\s\S]*from locked_membership/);
  });

  it("audits a correlated stale event and completes its job without updating membership or attempt rows", async () => {
    const statements: string[] = [];
    database.current = {transaction: async (callback: (tx: {execute(query: unknown): Promise<unknown>}) => Promise<unknown>) => callback({
      execute: async (query) => { statements.push(sqlText(query)); return {rows: [{claimed: true, matched: true}]}; },
    })};

    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), {...command, eventId: "evt_stale", eventCreated: 1})).resolves.toBe("processed");

    const sql = statements[0].toLowerCase();
    expect(sql).toMatch(/matched as[\s\S]*stale[\s\S]*or[\s\S]*status/);
    expect(sql).toMatch(/updated as[\s\S]*where[\s\S]*not matched\.stale/);
    expect(sql).toContain("stripe.webhook.ignored_stale");
    expect(sql).toMatch(/audited as[\s\S]*from outcome/);
    expect(sql).toMatch(/completed as[\s\S]*exists \(select 1 from audited\)/);
  });

  it("treats an existing event as a duplicate without a second statement", async () => {
    let executes = 0;
    database.current = {transaction: async (callback: (tx: {execute(): Promise<unknown>}) => Promise<unknown>) => callback({
      execute: async () => { executes += 1; return {rows: [{claimed: false, matched: false}]}; },
    })};
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).resolves.toBe("duplicate");
    expect(executes).toBe(1);
  });

  it("rolls back a claimed event whose ownership or attempt correlation fails", async () => {
    let failureRecordAttempted = false;
    database.current = {
      transaction: async (callback: (tx: {execute(): Promise<unknown>}) => Promise<unknown>) => callback({execute: async () => ({rows: [{claimed: true, matched: false}]})}),
      insert: () => { failureRecordAttempted = true; throw new Error("must not persist deterministic failures"); },
    };
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).rejects.toBeInstanceOf(WebhookCorrelationError);
    expect(failureRecordAttempted).toBe(false);
  });

  it("rejects a stale event with mismatched correlation before any mutation can commit", async () => {
    const statements: string[] = [];
    database.current = {
      transaction: async (callback: (tx: {execute(query: unknown): Promise<unknown>}) => Promise<unknown>) => callback({
        execute: async (query) => { statements.push(sqlText(query)); return {rows: [{claimed: true, matched: false}]}; },
      }),
      insert: () => { throw new Error("deterministic correlation failures must not be recorded outside the rolled-back transaction"); },
    };

    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), {
      ...command, eventId: "evt_stale_mismatch", eventCreated: 1, applicationId: "33333333-3333-4333-8333-333333333333",
    })).rejects.toBeInstanceOf(WebhookCorrelationError);

    expect(statements).toHaveLength(1);
    const sql = statements[0].toLowerCase();
    expect(sql).toMatch(/locked_membership as[\s\S]*33333333-3333-4333-8333-333333333333[\s\S]*startup[\s\S]*for update/);
    expect(sql.indexOf("33333333-3333-4333-8333-333333333333")).toBeLessThan(sql.indexOf("matched as"));
  });

  it("records only a redacted summary for a retryable transient failure", async () => {
    const recorded: Record<string, unknown>[] = [];
    database.current = {
      transaction: async () => { throw Object.assign(new Error("password=secret"), {code: "ECONNRESET"}); },
      insert: () => ({values: (value: Record<string, unknown>) => {
        recorded.push(value);
        return {onConflictDoUpdate: async () => undefined};
      }}),
    };
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).rejects.toThrow("password=secret");
    expect(recorded[0]).toMatchObject({state: "failed", lastError: "WEBHOOK_TRANSIENT:ECONNRESET"});
    expect(JSON.stringify(recorded[0])).not.toContain("password");
  });
});
