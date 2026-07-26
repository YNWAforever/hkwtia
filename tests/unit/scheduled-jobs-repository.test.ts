import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createScheduledJobsRepository,
  type ScheduledJobsExecutor,
} from "@/lib/db/repos/jobs";

const dialect = new PgDialect();
const stripeWebhookActor = {
  kind: "system",
  userId: null,
  source: "stripe-webhook",
} as const;
const memberActor = {
  kind: "member",
  userId: "auth-member",
  profileId: "member-1",
} as const;

function sequenceExecutor(responses: Record<string, unknown>[][]) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const executor: ScheduledJobsExecutor = {
    async execute(query) {
      commands.push(dialect.sqlToQuery(query));
      return {rows: responses.shift() ?? []};
    },
  };
  return {commands, executor};
}

describe("scheduled jobs repository fencing", () => {
  it("returns the persisted attempt count as the claim token for first claims and failed reclaims", async () => {
    const fixture = sequenceExecutor([
      [{claim_token: 1}],
      [],
      [{claim_token: 2}],
    ]);
    const repository = createScheduledJobsRepository(async () => fixture.executor);

    await expect(repository.claim(
      automationCronActor(),
      "journey-runner:2027-01-01T00",
      "journey-runner",
    )).resolves.toEqual({status: "claimed", attemptCount: 1});
    await expect(repository.claim(
      automationCronActor(),
      "journey-runner:2027-01-01T00",
      "journey-runner",
    )).resolves.toEqual({status: "duplicate"});
    await expect(repository.claim(
      automationCronActor(),
      "journey-runner:2027-01-01T00",
      "journey-runner",
    )).resolves.toEqual({status: "claimed", attemptCount: 2});

    const claimSql = fixture.commands[0]?.sql.replace(/\s+/g, " ");
    expect(claimSql).toMatch(/ON CONFLICT .* DO UPDATE/i);
    expect(claimSql).toMatch(/attempt_count.*\+ 1/i);
    expect(claimSql).toMatch(/WHERE .*state.*= 'failed'/i);
    expect(claimSql).toMatch(/RETURNING .*attempt_count.*claim_token/i);
  });

  it("treats processing and completed rows as duplicates because only failed rows can be reclaimed", async () => {
    const fixture = sequenceExecutor([[], []]);
    const repository = createScheduledJobsRepository(async () => fixture.executor);

    await expect(repository.claim(
      automationCronActor(),
      "running-job:2027-01-01T00",
      "running-job",
    )).resolves.toEqual({status: "duplicate"});
    await expect(repository.claim(
      automationCronActor(),
      "completed-job:2027-01-01T00",
      "completed-job",
    )).resolves.toEqual({status: "duplicate"});
  });

  it("settles only the exact processing attempt and returns false for a stale or missing claim", async () => {
    const fixture = sequenceExecutor([
      [],
      [],
      [{job_id: "job-1"}],
      [{job_id: "job-1"}],
    ]);
    const repository = createScheduledJobsRepository(async () => fixture.executor);

    await expect(repository.complete(
      automationCronActor(),
      "journey-runner:2027-01-01T00",
      1,
    )).resolves.toBe(false);
    await expect(repository.fail(
      automationCronActor(),
      "journey-runner:2027-01-01T00",
      1,
      "JOB_RUN_FAILED",
    )).resolves.toBe(false);
    await expect(repository.complete(
      automationCronActor(),
      "journey-runner:2027-01-01T00",
      2,
    )).resolves.toBe(true);
    await expect(repository.fail(
      automationCronActor(),
      "renewal-runner:2027-01-01",
      3,
      "JOB_RUN_FAILED",
    )).resolves.toBe(true);

    for (const command of fixture.commands) {
      const normalizedSql = command.sql.replace(/\s+/g, " ");
      expect(normalizedSql).toMatch(/WHERE .*run_key.*AND .*state.*= 'processing'.*AND .*attempt_count/i);
      expect(normalizedSql).toMatch(/RETURNING .*job_id/i);
    }
    expect(fixture.commands[0]?.params).toContain(1);
    expect(fixture.commands[2]?.params).toContain(2);
    expect(fixture.commands[3]?.params).toContain(3);
  });

  it.each([stripeWebhookActor, memberActor])(
    "rejects $kind scheduled-job mutations before opening the database",
    async (actor) => {
      const loadDatabase = vi.fn(async () => sequenceExecutor([]).executor);
      const repository = createScheduledJobsRepository(loadDatabase);

      await expect(repository.claim(actor, "job:2027-01-01T00", "job"))
        .rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(repository.complete(actor, "job:2027-01-01T00", 1))
        .rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(repository.fail(actor, "job:2027-01-01T00", 1, "JOB_RUN_FAILED"))
        .rejects.toMatchObject({code: "FORBIDDEN"});
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );
});
