import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {scheduleJourney} from "@/lib/automation/schedule";
import {
  createDunningLapseRepository,
  type DunningLapseInput,
} from "@/lib/db/repos/memberships";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const dialect = new PgDialect();
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
const executedAt = new Date("2027-01-15T02:00:00.000Z");
const membershipId = "11111111-1111-4111-8111-111111111111";
const journeyStateId = "22222222-2222-4222-8222-222222222222";
const profileId = "member-dunning-lapse";

const input: DunningLapseInput = {
  membershipId,
  profileId,
  journeyStateId,
  instanceKey: `termination:lapse:${journeyStateId}`,
  executedAt,
  winbackSteps: scheduleJourney({
    journey: "winback",
    profileId,
    membershipId,
    instanceKey: `termination:lapse:${journeyStateId}`,
    anchor: executedAt,
  }),
};

function sequenceDatabase(responses: unknown[][]) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  let transactions = 0;
  const execute = async (query: Parameters<AutomationSqlExecutor["execute"]>[0]) => {
    commands.push(dialect.sqlToQuery(query));
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => {
      transactions += 1;
      return work({execute});
    },
  };
  return {commands, database, transactions: () => transactions};
}

describe("D14 dunning lapse repository", () => {
  it("locks and lapses past_due, audits a stable identity, tasks once, and enrolls win-back atomically", async () => {
    const fake = sequenceDatabase([
      [{status: "past_due"}],
      [{id: membershipId}],
      [{id: "audit-1"}],
      [{id: "task-1"}],
      [{id: "winback-7"}, {id: "winback-21"}, {id: "winback-60"}],
    ]);
    const repo = createDunningLapseRepository(async () => fake.database);

    await expect(repo.lapseDunningEpisode(system, input)).resolves.toEqual({
      disposition: "lapsed",
      createdTasks: 1,
      createdSteps: 3,
    });

    expect(fake.transactions()).toBe(1);
    const sql = fake.commands.map((command) => command.sql.replace(/\s+/g, " "));
    expect(sql[0]).toMatch(/SELECT .*status.*FROM "memberships".*FOR UPDATE/i);
    expect(sql[1]).toMatch(/UPDATE "memberships".*status = 'expired'.*status = 'past_due'/i);
    expect(sql[2]).toMatch(/INSERT INTO "audit_events".*membership\.lapsed_by_dunning/i);
    expect(fake.commands[2]?.params).toContain(`dunning-lapse:${journeyStateId}`);
    expect(sql[3]).toMatch(/INSERT INTO "staff_tasks".*ON CONFLICT DO NOTHING/i);
    expect(sql[4]).toMatch(/INSERT INTO "journey_state".*ON CONFLICT DO NOTHING/i);
  });

  it("repairs idempotent side effects only when the expired membership carries this lapse identity", async () => {
    const fake = sequenceDatabase([
      [{status: "expired"}],
      [{id: "audit-1"}],
      [],
      [{id: "winback-60"}],
    ]);
    const repo = createDunningLapseRepository(async () => fake.database);

    await expect(repo.lapseDunningEpisode(system, input)).resolves.toEqual({
      disposition: "existing",
      createdTasks: 0,
      createdSteps: 1,
    });

    const sql = fake.commands.map((command) => command.sql.replace(/\s+/g, " "));
    expect(sql[1]).toMatch(/SELECT .*FROM "audit_events".*request_id/i);
    expect(sql.some((command) => /UPDATE "memberships"/i.test(command))).toBe(false);
    expect(sql.at(-2)).toMatch(/INSERT INTO "staff_tasks".*ON CONFLICT DO NOTHING/i);
    expect(sql.at(-1)).toMatch(/INSERT INTO "journey_state".*ON CONFLICT DO NOTHING/i);
  });

  it("does not lapse a resolved membership or create side effects", async () => {
    const fake = sequenceDatabase([[{status: "active"}]]);
    const repo = createDunningLapseRepository(async () => fake.database);

    await expect(repo.lapseDunningEpisode(system, input)).resolves.toEqual({
      disposition: "resolved",
      createdTasks: 0,
      createdSteps: 0,
    });
    expect(fake.commands).toHaveLength(1);
  });
});
