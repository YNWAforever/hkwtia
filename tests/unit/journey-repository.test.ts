import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {createDeliveriesRepository} from "@/lib/db/repos/deliveries";
import {
  createJourneysRepository,
  type AutomationDatabase,
  type AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {createSuppressionsRepository} from "@/lib/db/repos/suppressions";

const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
const admin = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;
const now = new Date("2027-01-15T10:00:00.000Z");
const dialect = new PgDialect();

const journeyRow = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  profile_id: "member-1",
  membership_id: null,
  journey: "onboarding_90d",
  instance_key: "activation:membership-1",
  step: "welcome",
  scheduled_at: now,
  status: "processing",
  attempt_count: 1,
  claimed_at: now,
  claim_expires_at: new Date(now.getTime() + 300_000),
  delivery_key: "journey:member-1:onboarding_90d:activation:membership-1:welcome",
  error_code: null,
  completed_at: null,
  created_at: now,
  updated_at: now,
  prior_status: "scheduled",
  ...overrides,
});

function commandFor(query: Parameters<PgDialect["sqlToQuery"]>[0]) {
  return dialect.sqlToQuery(query);
}

function sequenceDatabase(responses: unknown[][]) {
  const commands: string[] = [];
  const compiledCommands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const execute = async (query: Parameters<AutomationSqlExecutor["execute"]>[0]) => {
    const command = commandFor(query);
    compiledCommands.push(command);
    commands.push(command.sql.replace(/\s+/g, " ").trim());
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work({execute}),
  };
  return {commands, compiledCommands, database};
}

describe("journeys repository SQL and transitions", () => {
  it("enrolls idempotently with database uniqueness", async () => {
    const enrollment = {
      profileId: "member-1",
      membershipId: null,
      journey: "onboarding_90d",
      instanceKey: "activation:membership-1",
      step: "welcome",
      scheduledAt: now,
      deliveryKey: "journey:member-1:onboarding_90d:activation:membership-1:welcome",
    } as const;
    const createdDb = sequenceDatabase([[journeyRow({status: "scheduled", attempt_count: 0})]]);
    const existingDb = sequenceDatabase([[]]);

    await expect(createJourneysRepository(async () => createdDb.database).enroll(system, enrollment)).resolves.toBe("created");
    await expect(createJourneysRepository(async () => existingDb.database).enroll(system, enrollment)).resolves.toBe("existing");
    expect(createdDb.commands[0]).toMatch(/INSERT INTO "journey_state".*ON CONFLICT DO NOTHING.*RETURNING/i);
  });

  it("claims due and stale processing rows in one skip-locked transaction with a bounded lease", async () => {
    const fake = sequenceDatabase([[journeyRow()]]);
    const rows = await createJourneysRepository(async () => fake.database).claimDue(system, now, 1, 300_000);

    expect(rows).toMatchObject([{status: "processing", attemptCount: 1, profileId: "member-1"}]);
    expect(fake.commands).toHaveLength(1);
    expect(fake.commands[0]).toMatch(/WITH due AS .*status = 'scheduled'.*scheduled_at <= .*status = 'processing'.*claim_expires_at <= /i);
    expect(fake.commands[0]).toMatch(/FOR UPDATE SKIP LOCKED LIMIT .*UPDATE "journey_state" AS target/i);
    expect(fake.commands[0]).toMatch(/attempt_count = target\.attempt_count \+ 1.*RETURNING target\.\*/i);
  });

  it.each([
    ["markSent", (repo: ReturnType<typeof createJourneysRepository>) => repo.markSent(system, journeyRow().id, now, now), /status = 'sent'.*status = 'processing'.*claimed_at =/i],
    ["markSkipped", (repo: ReturnType<typeof createJourneysRepository>) => repo.markSkipped(system, journeyRow().id, now, "skip_condition", now), /status = 'skipped'.*error_code = .*status = 'processing'.*claimed_at =/i],
    ["reschedule", (repo: ReturnType<typeof createJourneysRepository>) => repo.reschedule(system, journeyRow().id, now, new Date(now.getTime() + 300_000), "retryable_network"), /status = 'scheduled'.*error_code = .*status = 'processing'.*claimed_at =/i],
    ["markFailed", async (repo: ReturnType<typeof createJourneysRepository>) => (await repo.markFailed(
      system, journeyRow().id, now, "attempts_exhausted", now, {
        profileId: "member-1", journeyStateId: journeyRow().id, kind: "permanent_delivery_failure",
        dedupeKey: "journey-1:permanent_delivery_failure", summaryCode: "attempts_exhausted",
      },
    )).record, /status = 'failed'.*error_code = .*status = 'processing'.*claimed_at =/i],
  ] as const)("allows processing -> terminal/retry transition through %s only", async (_name, invoke, expectedSql) => {
    const fake = sequenceDatabase([[journeyRow()]]);
    await expect(invoke(createJourneysRepository(async () => fake.database))).resolves.toMatchObject({id: journeyRow().id});
    expect(fake.commands[0]).toMatch(expectedSql);

    const rejected = sequenceDatabase([[]]);
    await expect(invoke(createJourneysRepository(async () => rejected.database)))
      .rejects.toMatchObject({code: "INVALID_TRANSITION"});
  });

  it("rejects a stale claim token after lease reclaim and accepts the current token", async () => {
    const oldClaimedAt = new Date(now.getTime() - 600_000);
    const currentClaimedAt = now;
    const completedAt = new Date(now.getTime() + 1_000);
    const commands: string[] = [];
    const database: AutomationDatabase = {
      execute: async (query) => {
        const command = commandFor(query);
        commands.push(command.sql.replace(/\s+/g, " ").trim());
        const ownsClaim = command.params.some((parameter) =>
          parameter instanceof Date && parameter.getTime() === currentClaimedAt.getTime());
        return {rows: ownsClaim ? [journeyRow({claimed_at: currentClaimedAt})] : []};
      },
      transaction: async (work) => work(database),
    };
    const repo = createJourneysRepository(async () => database);

    await expect(repo.markSent(system, journeyRow().id, oldClaimedAt, completedAt))
      .rejects.toMatchObject({code: "INVALID_TRANSITION"});
    await expect(repo.markSent(system, journeyRow().id, currentClaimedAt, completedAt))
      .resolves.toMatchObject({id: journeyRow().id});
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatch(/status = 'processing'.*claimed_at =/i);
    expect(commands[1]).toMatch(/status = 'processing'.*claimed_at =/i);
  });

  it("allows failed -> scheduled only as an atomic audited admin retry", async () => {
    const fake = sequenceDatabase([[journeyRow({status: "scheduled", error_code: null})], [], [], []]);
    const result = await createJourneysRepository(async () => fake.database).retryFailed(admin, journeyRow().id, now);

    expect(result).toMatchObject({status: "scheduled", errorCode: null});
    expect(fake.commands).toHaveLength(4);
    expect(fake.commands[0]).toMatch(/status = 'scheduled'.*error_code = NULL.*status = 'failed'/i);
    expect(fake.commands[1]).toMatch(/UPDATE "email_log".*attempt_count = attempt_count \+ 1.*journey_state_id = .*idempotency_key = .*status = 'failed'.*error_code IN/i);
    expect(fake.commands[2]).toMatch(/UPDATE "whatsapp_log".*attempt_count = attempt_count \+ 1.*journey_state_id = .*idempotency_key = .*status = 'failed'.*error_code IN/i);
    expect(fake.commands[3]).toMatch(/INSERT INTO "audit_events".*journey\.failed_retry_requested/i);
    expect(fake.compiledCommands[1].params).toContain(journeyRow().delivery_key);
    expect(fake.compiledCommands[2].params).toContain(`${journeyRow().delivery_key}:whatsapp`);
    expect(fake.compiledCommands[3].params).toContain(admin.profileId);
    expect(fake.compiledCommands[3].params).not.toContain(admin.userId);
  });

  it("does not audit or reopen sent/skipped/non-failed rows", async () => {
    const fake = sequenceDatabase([[]]);
    const repo = createJourneysRepository(async () => fake.database);

    await expect(repo.retryFailed(admin, journeyRow().id, now)).rejects.toMatchObject({code: "INVALID_TRANSITION"});
    expect(fake.commands).toHaveLength(1);
    expect(fake.commands[0]).toMatch(/status = 'failed'/i);
  });
});

describe("delivery, suppression, and staff-task idempotency", () => {
  it.each([
    ["email", createDeliveriesRepository, "reserveEmail", {
      profileId: "member-1", journeyStateId: journeyRow().id, template: "welcome", subject: "welcome_subject",
      idempotencyKey: "delivery:email", locale: "en", classification: "transactional",
    }],
    ["whatsapp", createDeliveriesRepository, "reserveWhatsapp", {
      profileId: "member-1", journeyStateId: journeyRow().id, template: "renewal_14",
      idempotencyKey: "delivery:whatsapp", locale: "zh-HK", classification: "transactional",
    }],
  ] as const)("reserves %s delivery exactly once", async (_channel, factory, method, input) => {
    const createdRow = {...journeyRow(), idempotency_key: input.idempotencyKey, status: "processing"};
    const fake = sequenceDatabase([[createdRow]]);
    const repo = factory(async () => fake.database);
    const result = await (repo[method] as (actor: typeof system, value: typeof input) => Promise<{disposition: string}>)(system, input);

    expect(result.disposition).toBe("created");
    expect(fake.commands[0]).toMatch(/ON CONFLICT DO NOTHING.*RETURNING/i);

    const duplicate = sequenceDatabase([[], [createdRow]]);
    const duplicateRepo = factory(async () => duplicate.database);
    await expect((duplicateRepo[method] as (actor: typeof system, value: typeof input) => Promise<{disposition: string}>)(system, input))
      .resolves.toMatchObject({disposition: "existing"});
    expect(duplicate.commands[1]).toMatch(/WHERE .*idempotency_key/i);
  });

  it("completes reserved delivery logs without exposing recipient data", async () => {
    const email = sequenceDatabase([[{id: "email-1", status: "sent", provider_id: "provider-1"}]]);
    const whatsapp = sequenceDatabase([[{id: "whatsapp-1", status: "failed", error_code: "provider_client_error"}]]);
    const emailResult = await createDeliveriesRepository(async () => email.database)
      .completeEmail(system, "email-1", {status: "sent", providerId: "provider-1"});
    const whatsappResult = await createDeliveriesRepository(async () => whatsapp.database)
      .completeWhatsapp(system, "whatsapp-1", {status: "failed", errorCode: "provider_client_error"});

    expect(emailResult).not.toHaveProperty("email");
    expect(whatsappResult).not.toHaveProperty("phone");
    expect(email.commands[0]).toMatch(/status = .*provider_id = .*WHERE .*id = .*status = 'processing'/i);
    expect(whatsapp.commands[0]).toMatch(/status = .*error_code = .*WHERE .*id = .*status = 'processing'/i);
  });

  it("atomically and idempotently disables marketing consent and inserts email suppression", async () => {
    const created = sequenceDatabase([[{id: "member-1"}], [{id: "suppression-1"}]]);
    const existing = sequenceDatabase([[{id: "member-1"}], []]);

    await expect(createSuppressionsRepository(async () => created.database)
      .unsubscribeEmailMarketing(system, "member-1", "member_unsubscribe")).resolves.toBe("created");
    await expect(createSuppressionsRepository(async () => existing.database)
      .unsubscribeEmailMarketing(system, "member-1", "member_unsubscribe")).resolves.toBe("existing");
    expect(created.commands[0]).toMatch(/UPDATE "profiles".*consent_marketing = false/i);
    expect(created.commands[1]).toMatch(/INSERT INTO "message_suppressions".*'email'.*'marketing'.*ON CONFLICT DO NOTHING/i);
  });

  it("deduplicates staff tasks with a stable key", async () => {
    const input = {
      profileId: "member-1", journeyStateId: journeyRow().id, kind: "permanent_delivery_failure",
      dedupeKey: "journey-1:permanent_delivery_failure", summaryCode: "attempts_exhausted",
    };
    const row = {id: "task-1", profile_id: "member-1", journey_state_id: journeyRow().id, status: "open", ...input};
    const created = sequenceDatabase([[row]]);
    const existing = sequenceDatabase([[], [row]]);

    await expect(createStaffTasksRepository(async () => created.database).createOnce(system, input))
      .resolves.toMatchObject({disposition: "created"});
    await expect(createStaffTasksRepository(async () => existing.database).createOnce(system, input))
      .resolves.toMatchObject({disposition: "existing"});
    expect(created.commands[0]).toMatch(/INSERT INTO "staff_tasks".*ON CONFLICT DO NOTHING.*RETURNING/i);
  });
});
