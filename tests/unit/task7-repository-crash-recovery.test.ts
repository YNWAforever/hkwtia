import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {createCampaignRecipientDeliveryRepository} from "@/lib/db/repos/campaign-recipient-delivery";
import {createDeliveriesRepository} from "@/lib/db/repos/deliveries";
import {
  createJourneysRepository,
  type AutomationDatabase,
  type AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const webhookActor = {kind: "system", userId: null, source: "stripe-webhook"} as const;
const cronActor = {kind: "system", userId: null, source: "automation-cron"} as const;
const forgedActor = {kind: "system", userId: null, source: "another-system"} as const;
const now = new Date("2027-01-15T10:00:00.000Z");
const dialect = new PgDialect();

function sequenceDatabase(responses: unknown[][]) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const execute = async (query: Parameters<AutomationSqlExecutor["execute"]>[0]) => {
    commands.push(dialect.sqlToQuery(query));
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work({execute}),
  };
  return {commands, database};
}

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "member-1",
    journey_state_id: "22222222-2222-4222-8222-222222222222",
    template: "welcome",
    subject: "Welcome",
    status: "failed",
    provider_id: null,
    idempotency_key: "journey:member-1:welcome",
    locale: "en",
    classification: "transactional",
    attempt_count: 1,
    error_code: "retryable_network",
    created_at: now,
    ...overrides,
  };
}

function journeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    profile_id: "member-1",
    membership_id: null,
    journey: "onboarding_90d",
    instance_key: "activation:membership-1",
    step: "welcome",
    scheduled_at: now,
    status: "processing",
    prior_status: "scheduled",
    attempt_count: 1,
    claimed_at: now,
    claim_expires_at: new Date(now.getTime() + 300_000),
    delivery_key: "journey:member-1:onboarding_90d:activation:membership-1:welcome",
    error_code: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    campaign_id: "44444444-4444-4444-8444-444444444444",
    profile_id: "member-1",
    email: "member-1@example.test",
    locale: "en",
    variables: {displayName: "Member"},
    template: "renewal-reminder",
    status: "processing",
    prior_status: "queued",
    attempt_count: 1,
    claimed_at: now,
    claim_expires_at: new Date(now.getTime() + 300_000),
    error_code: null,
    ...overrides,
  };
}

describe("Task 7 repository crash-recovery contracts", () => {
  it("returns a failed reservation unchanged until an explicit retry is requested", async () => {
    const failed = deliveryRow();
    const fake = sequenceDatabase([[], [failed]]);
    const repo = createDeliveriesRepository(async () => fake.database);

    await expect(repo.reserveEmail(webhookActor, {
      profileId: "member-1",
      journeyStateId: String(failed.journey_state_id),
      template: "welcome",
      subject: "Welcome",
      idempotencyKey: String(failed.idempotency_key),
      locale: "en",
      classification: "transactional",
    })).resolves.toMatchObject({
      disposition: "existing",
      record: {
        status: "failed",
        attemptCount: 1,
        errorCode: "retryable_network",
      },
    });

    expect(fake.commands[1]?.sql.replace(/\s+/g, " "))
      .toMatch(/SELECT .*FROM "email_log".*idempotency_key/i);
    expect(fake.commands[1]?.sql).not.toMatch(/UPDATE/i);
  });

  it("reopens a known failed delivery only through the explicit fenced retry mutation", async () => {
    const processing = deliveryRow({
      status: "processing",
      attempt_count: 2,
      error_code: null,
    });
    const fake = sequenceDatabase([[processing]]);
    const repo = createDeliveriesRepository(async () => fake.database);

    await expect(repo.retryEmailFailure(
      cronActor,
      String(processing.id),
      "retryable_network",
    )).resolves.toMatchObject({
      status: "processing",
      attemptCount: 2,
      errorCode: null,
    });

    const command = fake.commands[0]?.sql.replace(/\s+/g, " ");
    expect(command).toMatch(/UPDATE "email_log".*status = 'processing'/i);
    expect(command).toMatch(/attempt_count = .*attempt_count \+ 1/i);
    expect(command).toMatch(/WHERE .*id = .*status = 'failed'.*error_code =/i);
  });

  it.each([
    ["scheduled", "scheduled"],
    ["processing", "stale"],
  ] as const)("returns journey claim source %s as %s", async (priorStatus, expectedSource) => {
    const fake = sequenceDatabase([[journeyRow({prior_status: priorStatus})]]);
    const repo = createJourneysRepository(async () => fake.database);

    await expect(repo.claimDue(cronActor, now, 1, 300_000))
      .resolves.toMatchObject([{claimSource: expectedSource}]);

    const command = fake.commands[0]?.sql.replace(/\s+/g, " ");
    expect(command).toMatch(/SELECT id, status AS prior_status/i);
    expect(command).toMatch(/RETURNING target\.\*, due\.prior_status/i);
  });

  it.each([
    ["queued", null, "queued"],
    ["processing", null, "stale"],
    ["processing", "retryable_server", "retry"],
  ] as const)(
    "returns campaign claim source %s with prior error %s as %s",
    async (priorStatus, priorErrorCode, expectedSource) => {
    const fake = sequenceDatabase([[campaignRow({
      prior_status: priorStatus,
      prior_error_code: priorErrorCode,
    })]]);
    const repo = createCampaignRecipientDeliveryRepository(async () => fake.database);

    await expect(repo.claimRecipients(cronActor, now, 1, 300_000))
      .resolves.toMatchObject([{claimSource: expectedSource}]);

    const command = fake.commands[0]?.sql.replace(/\s+/g, " ");
    expect(command).toMatch(/SELECT target\.id, target\.status AS prior_status/i);
    expect(command).toMatch(/target\.error_code AS prior_error_code/i);
    expect(command).toMatch(/RETURNING target\.\*, due\.prior_status/i);
    },
  );

  it("accepts the dedicated cron principal while rejecting forged system sources", async () => {
    const loadDatabase = vi.fn(async () => sequenceDatabase([[]]).database);
    const repo = createJourneysRepository(loadDatabase);
    const enrollment = {
      profileId: "member-1",
      membershipId: null,
      journey: "onboarding_90d",
      instanceKey: "activation:membership-1",
      step: "welcome",
      scheduledAt: now,
      deliveryKey: "journey:member-1:onboarding_90d:activation:membership-1:welcome",
    } as const;

    await expect(repo.enroll(cronActor, enrollment)).resolves.toBe("existing");
    await expect(repo.enroll(forgedActor as never, enrollment))
      .rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).toHaveBeenCalledTimes(1);
  });
});
