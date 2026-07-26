import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {createDeliveriesRepository} from "@/lib/db/repos/deliveries";
import type {AutomationDatabase, AutomationSqlExecutor} from "@/lib/db/repos/journeys";

const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
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

function row(overrides: Record<string, unknown> = {}) {
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

describe("delivery retry and completion idempotency", () => {
  it("reopens a failed reservation and increments its durable attempt", async () => {
    const reopened = row({status: "processing", attempt_count: 2, error_code: null});
    const fake = sequenceDatabase([[], [row()], [reopened]]);
    const repo = createDeliveriesRepository(async () => fake.database);

    await expect(repo.reserveEmail(system, {
      profileId: "member-1",
      journeyStateId: "22222222-2222-4222-8222-222222222222",
      template: "welcome",
      subject: "Welcome",
      idempotencyKey: "journey:member-1:welcome",
      locale: "en",
      classification: "transactional",
    })).resolves.toMatchObject({
      disposition: "existing",
      record: {status: "failed", attemptCount: 1, errorCode: "retryable_network"},
    });

    await expect(repo.retryEmailFailure(
      system,
      String(reopened.id),
      "retryable_network",
    )).resolves.toMatchObject({status: "processing", attemptCount: 2, errorCode: null});

    expect(fake.commands[1]?.sql.replace(/\s+/g, " "))
      .toMatch(/SELECT .*FROM "email_log".*idempotency_key/i);
    expect(fake.commands[2]?.sql.replace(/\s+/g, " ")).toMatch(
      /UPDATE "email_log".*status = 'processing'.*attempt_count = .*attempt_count \+ 1.*status = 'failed'/i,
    );
  });

  it("returns the matching terminal row when completion already committed", async () => {
    const sent = row({status: "sent", provider_id: "provider-1", error_code: null});
    const fake = sequenceDatabase([[], [sent]]);
    const repo = createDeliveriesRepository(async () => fake.database);

    await expect(repo.completeEmail(system, String(sent.id), {
      status: "sent",
      providerId: "provider-1",
    })).resolves.toMatchObject({
      id: sent.id,
      status: "sent",
      providerId: "provider-1",
    });

    expect(fake.commands[1]?.sql.replace(/\s+/g, " "))
      .toMatch(/SELECT .*FROM "email_log".*WHERE .*id =/i);
  });
});
