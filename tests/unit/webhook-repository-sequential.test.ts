import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {systemActor} from "@/lib/auth/actor";
import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {jobsRepository, WebhookCorrelationError} from "@/lib/db/repos/jobs";
import {applicationId, checkoutSessionId, customerId, membershipId, subscriptionId} from "@/tests/fixtures/stripe-events";

const command: WebhookLifecycleCommand = {
  eventId: "evt_m", eventType: "checkout.session.completed", eventCreated: 100,
  membershipId, applicationId, planCode: "startup", stripeCustomerId: customerId,
  stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId: checkoutSessionId,
  nextStatus: "active", billingPeriodStart: null, billingPeriodEnd: null, cancelAtPeriodEnd: false, isRenewal: false,
};

function sqlText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  if ("value" in value && Array.isArray((value as {value?: unknown}).value)) return ((value as {value: unknown[]}).value).join("");
  if ("queryChunks" in value && Array.isArray((value as {queryChunks?: unknown}).queryChunks)) {
    return (value as {queryChunks: unknown[]}).queryChunks.map(sqlText).join(" ");
  }
  return "";
}

type Result = {rows: Record<string, unknown>[]};

function scriptedDatabase(results: Result[]) {
  const statements: string[] = [];
  const options: unknown[] = [];
  let committed = false;
  const db = {
    async transaction(work: (tx: {execute(query: unknown): Promise<Result>}) => Promise<unknown>, config?: unknown) {
      options.push(config);
      const remaining = [...results];
      const value = await work({execute: async (query) => {
        statements.push(sqlText(query).toLowerCase());
        const result = remaining.shift();
        if (!result) throw new Error("unexpected statement");
        return result;
      }});
      if (remaining.length) throw new Error(`unused scripted results: ${remaining.length}`);
      committed = true;
      return value;
    },
    execute: vi.fn(async () => ({rows: []})),
  };
  return {db, statements, options, committed: () => committed};
}

const claimed = {rows: [{job_id: "job-1"}]};
const locked = {rows: [{membership_id: membershipId, status: "pending_payment", profile_id: "profile-1", company_id: null}]};
const noLatest = {rows: []};
const attempt = {rows: [{attempt_id: "attempt-1"}]};
const membershipUpdated = {rows: [{membership_id: membershipId}]};
const attemptUpdated = {rows: [{attempt_id: "attempt-1"}]};
const journeyInserted = {rows: []};
const audited = {rows: [{audit_id: "audit-1"}]};
const completed = {rows: [{job_id: "job-1"}]};

describe("sequential production webhook transaction", () => {
  beforeEach(() => { database.current = null; });

  it("uses fresh READ COMMITTED statements after membership and exact-attempt row locks", async () => {
    const script = scriptedDatabase([claimed, locked, noLatest, attempt, membershipUpdated, attemptUpdated, journeyInserted, audited, completed]);
    database.current = script.db;

    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).resolves.toBe("processed");

    expect(script.options).toEqual([{isolationLevel: "read committed"}]);
    expect(script.statements).toHaveLength(9);
    expect(script.statements[0]).toMatch(/insert into[\s\S]*on conflict[\s\S]*failed[\s\S]*returning/);
    expect(script.statements[1]).toMatch(/coalesce[\s\S]*left join[\s\S]*for update of/);
    expect(script.statements[2]).toMatch(/stripe\.webhook\.processed[\s\S]*order by/);
    expect(script.statements[3]).toMatch(/active[\s\S]*cs_test_m1_checkout[\s\S]*for update/);
    expect(script.statements[4]).toMatch(/update[\s\S]*active/);
    expect(script.statements[5]).toMatch(/update[\s\S]*attempt-1/);
    expect(script.statements[6]).toMatch(/insert into[\s\S]*jsonb_to_recordset[\s\S]*activation:/);
    expect(script.statements[7]).toContain("stripe.webhook.processed");
    expect(script.statements[8]).toMatch(/update[\s\S]*completed/);
    expect(script.committed()).toBe(true);
  });

  it("returns duplicate after only the claim statement for a completed or in-flight event", async () => {
    const script = scriptedDatabase([{rows: []}]);
    database.current = script.db;
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).resolves.toBe("duplicate");
    expect(script.statements).toHaveLength(1);
    expect(script.db.execute).not.toHaveBeenCalled();
  });

  it("shares renewalOrdinal within one billing period and increments for the next period", async () => {
    async function processRenewal(eventId: string, eventType: "invoice.paid" | "invoice.payment_failed", periodStart: Date, renewalOrdinal: number) {
      const renewal = {...command, eventId, eventType, stripeCheckoutSessionId: null, isRenewal: true,
        nextStatus: eventType === "invoice.paid" ? "active" as const : "past_due" as const,
        billingPeriodStart: periodStart, billingPeriodEnd: new Date(periodStart.getTime() + 365 * 86_400_000)};
      const script = scriptedDatabase([
        claimed,
        {rows: [{membership_id: membershipId, status: eventType === "invoice.paid" ? "past_due" : "active", profile_id: "profile-1", company_id: null}]},
        noLatest, membershipUpdated, journeyInserted, {rows: [{renewal_ordinal: renewalOrdinal}]}, {rows: [{engagement_id: `engagement-${eventId}`}]}, audited, completed,
      ]);
      database.current = script.db;
      await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), renewal)).resolves.toBe("processed");
      expect(script.statements[4]).toContain("jsonb_to_recordset");
      expect(script.statements[4]).toContain(eventType === "invoice.payment_failed" ? `payment:${eventId}` : `activation:${membershipId}`);
      expect(script.statements[5]).toMatch(/periodstart[\s\S]*renewalordinal[\s\S]*max/);
      expect(script.statements[5]).toContain("'^[1-9][0-9]{0,9}$'");
      expect(script.statements[5]).toMatch(/jsonb_typeof[\s\S]*renewalordinal[\s\S]*length[\s\S]*2147483647[\s\S]*::int/);
      expect(script.statements[6]).toMatch(new RegExp(`'renewalordinal',\\s*${renewalOrdinal}\\b`));
      expect(script.statements[6]).toContain("profile-1");
      return script.statements;
    }

    const firstPeriod = new Date("2026-07-01T00:00:00.000Z");
    await processRenewal("evt_failed_first", "invoice.payment_failed", firstPeriod, 1);
    await processRenewal("evt_paid_first", "invoice.paid", firstPeriod, 1);
    await processRenewal("evt_paid_second", "invoice.paid", new Date("2027-07-01T00:00:00.000Z"), 2);
  });
  it("audits a valid stale checkout once without membership or attempt mutation", async () => {
    const script = scriptedDatabase([
      claimed,
      {rows: [{membership_id: membershipId, status: "cancelled"}]},
      {rows: [{stripe_created: 101, event_id: "evt_z"}]},
      attempt,
      audited,
      completed,
    ]);
    database.current = script.db;

    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).resolves.toBe("processed");
    expect(script.statements).toHaveLength(6);
    expect(script.statements.some((statement) => /update[\s\S]*membership_status/.test(statement))).toBe(false);
    expect(script.statements.some((statement) => /set[\s\S]*completed[\s\S]*attempt-1/.test(statement))).toBe(false);
    expect(script.statements[4]).toContain("stripe.webhook.ignored_stale");
  });

  it("uses event ID as a deterministic tiebreaker for contradictory same-second events", async () => {
    const higher = scriptedDatabase([
      claimed, locked, {rows: [{stripe_created: 100, event_id: "evt_a"}]}, attempt,
      membershipUpdated, attemptUpdated, journeyInserted, audited, completed,
    ]);
    database.current = higher.db;
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), {...command, eventId: "evt_z"})).resolves.toBe("processed");
    expect(higher.statements[6]).toContain("jsonb_to_recordset");
    expect(higher.statements[7]).toContain("stripe.webhook.processed");

    const lower = scriptedDatabase([
      claimed, locked, {rows: [{stripe_created: 100, event_id: "evt_z"}]}, attempt, audited, completed,
    ]);
    database.current = lower.db;
    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), {...command, eventId: "evt_a"})).resolves.toBe("processed");
    expect(lower.statements[4]).toContain("stripe.webhook.ignored_stale");
    expect(lower.statements).toHaveLength(6);
  });

  it("rolls back a claimed mismatched event before audit or mutation", async () => {
    const statements: string[] = [];
    let committed = false;
    database.current = {
      async transaction(work: (tx: {execute(query: unknown): Promise<Result>}) => Promise<unknown>) {
        const results = [claimed, {rows: []}];
        try {
          const value = await work({execute: async (query) => {
            statements.push(sqlText(query).toLowerCase());
            return results.shift() ?? {rows: []};
          }});
          committed = true;
          return value;
        } catch (error) { throw error; }
      },
      execute: vi.fn(),
    };

    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).rejects.toBeInstanceOf(WebhookCorrelationError);
    expect(statements).toHaveLength(2);
    expect(committed).toBe(false);
    expect((database.current as {execute: ReturnType<typeof vi.fn>}).execute).not.toHaveBeenCalled();
  });

  it("records transient failure without downgrading completed or processing jobs", async () => {
    const failureStatements: string[] = [];
    database.current = {
      transaction: async () => { throw Object.assign(new Error("password=secret"), {code: "ECONNRESET"}); },
      execute: vi.fn(async (query: unknown) => { failureStatements.push(sqlText(query).toLowerCase()); return {rows: []}; }),
    };

    await expect(jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), command)).rejects.toThrow("password=secret");
    expect(failureStatements).toHaveLength(1);
    expect(failureStatements[0]).toMatch(/insert into[\s\S]*failed[\s\S]*on conflict[\s\S]*where[\s\S]*failed/);
    expect(failureStatements[0]).toMatch(/set[\s\S]*\+[\s\S]*1/);
    expect(failureStatements[0]).not.toMatch(/where[\s\S]*(completed|processing)/);
    expect(failureStatements[0]).toContain("webhook_transient:econnreset");
    expect(failureStatements[0]).not.toContain("password");
  });
});
