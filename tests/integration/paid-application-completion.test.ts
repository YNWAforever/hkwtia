// @vitest-environment node
import {randomUUID} from "node:crypto";

import {type SQL} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import {PgDialect} from "drizzle-orm/pg-core";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

import type {Database} from "@/lib/db/repos/common";

const connection = vi.hoisted(() => ({database: null as Database | null}));
vi.mock("@/lib/db/repos/common", async original => ({
  ...await original<typeof import("@/lib/db/repos/common")>(),
  getDb: async () => {
    if (!connection.database) throw new Error("ISOLATED_DATABASE_NOT_READY");
    return connection.database;
  },
}));

import {systemActor} from "@/lib/auth/authorize";
import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {jobsRepository} from "@/lib/db/repos/jobs";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {assertIsolatedSeedEnvironment} from "@/scripts/lib/acceptance-guard";

const enabled = process.env.RUN_DATABASE_TESTS === "1" && Boolean(process.env.DATABASE_URL_TEST);
const actor = systemActor("stripe-webhook");
const dialect = new PgDialect();
const fixtures: Fixture[] = [];
const eventIds = new Set<string>();
let pool: Pool;
let database: Database;

type Fixture = Readonly<{
  profileId: string;
  applicationId: string;
  membershipId: string;
  checkoutId: string;
  customerId: string;
  subscriptionId: string;
  eventId: string;
}>;

async function fixture(applicationStatus = "pending_payment"): Promise<Fixture> {
  const suffix = randomUUID();
  const value = {
    profileId: `paid-application-${suffix}`,
    applicationId: randomUUID(),
    membershipId: randomUUID(),
    checkoutId: `cs_test_application_${suffix}`,
    customerId: `cus_test_application_${suffix}`,
    subscriptionId: `sub_test_application_${suffix}`,
    eventId: `evt_test_application_${suffix}`,
  };
  fixtures.push(value);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic paid application','member')",
      [value.profileId, `${value.profileId}@example.test`],
    );
    await client.query(
      "INSERT INTO membership_applications(id,applicant_user_id,plan_code,current_step,status) VALUES($1,$2,'startup','checkout',$3)",
      [value.applicationId, value.profileId, applicationStatus],
    );
    await client.query(
      "INSERT INTO memberships(id,owner_user_id,application_id,plan_code,status,seat_limit) VALUES($1,$2,$3,'startup','pending_payment',5)",
      [value.membershipId, value.profileId, value.applicationId],
    );
    await client.query(
      "INSERT INTO billing_attempts(membership_id,attempt_number,idempotency_key,price_reference,state,stripe_checkout_session_id) VALUES($1,1,$2,'price_test_application','active',$3)",
      [value.membershipId, `test-application:${value.membershipId}`, value.checkoutId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return value;
}

function command(value: Fixture, overrides: Partial<WebhookLifecycleCommand> = {}): WebhookLifecycleCommand {
  return {
    eventId: value.eventId, eventType: "checkout.session.completed", eventCreated: 1760000000,
    membershipId: value.membershipId, applicationId: value.applicationId, planCode: "startup",
    stripeCustomerId: value.customerId, stripeSubscriptionId: value.subscriptionId,
    stripeCheckoutSessionId: value.checkoutId, nextStatus: "active",
    billingPeriodStart: null, billingPeriodEnd: null, cancelAtPeriodEnd: false, isRenewal: false,
    ...overrides,
  };
}

async function processEvent(value: WebhookLifecycleCommand) {
  eventIds.add(value.eventId);
  return jobsRepository.processWebhookLifecycle(actor, value);
}

async function application(value: Fixture) {
  return (await pool.query(
    "SELECT status,current_step,updated_at FROM membership_applications WHERE id=$1",
    [value.applicationId],
  )).rows[0] as {status: string; current_step: string; updated_at: Date};
}

function failApplicationUpdate(source: Database): Database {
  return new Proxy(source, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return (work: Parameters<Database["transaction"]>[0], options?: Parameters<Database["transaction"]>[1]) =>
          target.transaction(tx => work(new Proxy(tx, {
            get(transaction, key, transactionReceiver) {
              if (key === "execute") {
                return (query: SQL) => {
                  if (/^\s*UPDATE\s+"membership_applications"/i.test(dialect.sqlToQuery(query).sql)) {
                    throw new Error("SYNTHETIC_APPLICATION_COMPLETION_FAILURE");
                  }
                  return transaction.execute(query);
                };
              }
              return Reflect.get(transaction, key, transactionReceiver);
            },
          })), options);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

// Uses only an operator-confirmed, host-allowlisted DATABASE_URL_TEST. It never
// migrates, truncates, or resets the branch; teardown targets only generated IDs.
describe.skipIf(!enabled)("paid application completion on isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = assertIsolatedSeedEnvironment(process.env, {
      prefix: "PAID_APPLICATION_ACCEPTANCE",
      flag: "AUDIT_ISOLATED_ACCEPTANCE",
      hostAllowlistVar: "M2_TEST_NEON_HOST",
    });
    if (!process.env.M2_TEST_NEON_PROJECT_ID?.trim()) throw new Error("TEST_PROJECT_REQUIRED");
    pool = new Pool({connectionString: url, max: 4, connectionTimeoutMillis: 15000, statement_timeout: 15000});
    database = drizzle(pool) as unknown as Database;
    connection.database = database;
  });

  afterAll(async () => {
    connection.database = database;
    if (pool) {
      const memberships = fixtures.map(value => value.membershipId);
      const applications = fixtures.map(value => value.applicationId);
      await pool.query("DELETE FROM jobs WHERE run_key=ANY($1::text[])", [[...eventIds]]);
      await pool.query("DELETE FROM audit_events WHERE target_id=ANY($1::text[])", [[...memberships, ...applications]]);
      await pool.query("DELETE FROM engagement_events WHERE metadata->>'membershipId'=ANY($1::text[])", [memberships]);
      await pool.query("DELETE FROM journey_state WHERE membership_id=ANY($1::uuid[])", [memberships]);
      await pool.query("DELETE FROM billing_attempts WHERE membership_id=ANY($1::uuid[])", [memberships]);
      await pool.query("DELETE FROM memberships WHERE id=ANY($1::uuid[])", [memberships]);
      await pool.query("DELETE FROM membership_applications WHERE id=ANY($1::uuid[])", [applications]);
      await pool.query("DELETE FROM profiles WHERE id=ANY($1::text[])", [fixtures.map(value => value.profileId)]);
      await pool.end();
    }
    connection.database = null;
  });

  it.each(["checkout.session.completed", "checkout.session.async_payment_succeeded"] as const)(
    "%s completes only the linked pending application in the activation transaction",
    async eventType => {
      const value = await fixture(), foreign = await fixture();
      await expect(processEvent(command(value, {eventType}))).resolves.toBe("processed");
      expect((await pool.query("SELECT status FROM memberships WHERE id=$1", [value.membershipId])).rows)
        .toEqual([{status: "active"}]);
      expect(await application(value)).toMatchObject({status: "completed", current_step: "complete"});
      expect(await application(foreign)).toMatchObject({status: "pending_payment", current_step: "checkout"});
    },
  );

  it("concurrent delivery and exact-event replay complete the application only once", async () => {
    const value = await fixture(), input = command(value);
    const results = await Promise.all([processEvent(input), processEvent(input)]);
    expect(results.sort()).toEqual(["duplicate", "processed"]);
    const completed = await application(value);
    expect(completed).toMatchObject({status: "completed", current_step: "complete"});
    await expect(processEvent(input)).resolves.toBe("duplicate");
    expect(await application(value)).toEqual(completed);
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE request_id=$1", [input.eventId])).rows)
      .toEqual([{count: 1}]);
  });

  it("a stale paid event cannot complete an application after a newer cancellation", async () => {
    const value = await fixture();
    await pool.query("UPDATE memberships SET stripe_customer_id=$2,stripe_subscription_id=$3 WHERE id=$1",
      [value.membershipId, value.customerId, value.subscriptionId]);
    await processEvent(command(value, {eventId: `${value.eventId}_cancel`, eventType: "customer.subscription.deleted",
      eventCreated: 1760000010, stripeCheckoutSessionId: null, nextStatus: "cancelled"}));
    await expect(processEvent(command(value))).resolves.toBe("processed");
    expect(await application(value)).toMatchObject({status: "pending_payment", current_step: "checkout"});
    expect((await pool.query("SELECT status FROM memberships WHERE id=$1", [value.membershipId])).rows)
      .toEqual([{status: "cancelled"}]);
    expect((await pool.query("SELECT action FROM audit_events WHERE request_id=$1", [value.eventId])).rows)
      .toEqual([{action: "stripe.webhook.ignored_stale"}]);
  });

  it.each(["draft", "pending_review"])("does not turn a %s application into an approved application", async status => {
    const value = await fixture(status);
    await processEvent(command(value));
    expect(await application(value)).toMatchObject({status, current_step: "checkout"});
  });

  it("later subscription updates and cancellation never regress a completed application", async () => {
    const value = await fixture();
    await processEvent(command(value));
    const completed = await application(value);
    expect(completed.status).toBe("completed");
    await processEvent(command(value, {eventId: `${value.eventId}_active`, eventType: "customer.subscription.updated",
      eventCreated: 1760000010, stripeCheckoutSessionId: null}));
    expect(await application(value)).toEqual(completed);
    await processEvent(command(value, {eventId: `${value.eventId}_cancel`, eventType: "customer.subscription.deleted",
      eventCreated: 1760000020, stripeCheckoutSessionId: null, nextStatus: "cancelled"}));
    expect(await application(value)).toEqual(completed);
  });

  it.each([
    {name: "payment status", patch: {status: "pending_payment", currentStep: "checkout"}},
    {name: "step only", patch: {currentStep: "company"}},
  ] as const)("a late browser $name save cannot regress a paid application", async ({patch}) => {
    const value = await fixture();
    // The browser prepared this patch while payment was still pending. Its
    // write reaches PostgreSQL after the verified webhook has committed.
    await processEvent(command(value));
    expect(await application(value)).toMatchObject({status: "completed", current_step: "complete"});
    const saved = await applicationsRepository.update(
      {kind: "member", userId: value.profileId, profileId: value.profileId},
      value.applicationId,
      patch,
    );
    expect(saved).toMatchObject({status: "completed", currentStep: "complete"});
    expect(await application(value)).toMatchObject({status: "completed", current_step: "complete"});
  });

  it("application-write failure rolls back activation; the same event recovers after the failure", async () => {
    const value = await fixture(), input = command(value);
    connection.database = failApplicationUpdate(database);
    try {
      await expect(processEvent(input)).rejects.toThrow("SYNTHETIC_APPLICATION_COMPLETION_FAILURE");
    } finally {
      connection.database = database;
    }
    expect(await application(value)).toMatchObject({status: "pending_payment", current_step: "checkout"});
    expect((await pool.query("SELECT status FROM memberships WHERE id=$1", [value.membershipId])).rows)
      .toEqual([{status: "pending_payment"}]);
    expect((await pool.query("SELECT state FROM billing_attempts WHERE membership_id=$1", [value.membershipId])).rows)
      .toEqual([{state: "active"}]);
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE request_id=$1", [input.eventId])).rows)
      .toEqual([{count: 0}]);
    await expect(processEvent(input)).resolves.toBe("processed");
    expect(await application(value)).toMatchObject({status: "completed", current_step: "complete"});
    await expect(processEvent(input)).resolves.toBe("duplicate");
  });
});
