import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  expireStaleApprovals,
  type ApprovalExpiryDependencies,
} from "@/lib/automation/approvals-expirer";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createApprovalExpiryRepository,
  type ApprovalExpiryRepository,
} from "@/lib/db/repos/approvals";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const HOUR_MS = 3_600_000;
const asOf = new Date("2027-01-15T18:00:00.000Z");
const cronActor = automationCronActor();
const dialect = new PgDialect();

function sequenceDatabase(responses: unknown[][], failure?: Error) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  let transactions = 0;
  let committed = false;
  const execute = async (query: Parameters<AutomationSqlExecutor["execute"]>[0]) => {
    commands.push(dialect.sqlToQuery(query));
    if (failure) throw failure;
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => {
      transactions += 1;
      const result = await work({execute});
      committed = true;
      return result;
    },
  };
  return {
    commands,
    database,
    transactions: () => transactions,
    committed: () => committed,
  };
}

describe("approval expiry runner", () => {
  it("batches pending approvals and reports missing requester profiles with stable codes", async () => {
    const expirePendingBatch = vi.fn<ApprovalExpiryRepository["expirePendingBatch"]>()
      .mockResolvedValueOnce({
        expired: 2,
        auditsCreated: 2,
        tasksCreated: 1,
        missingRequesterProfiles: 1,
      })
      .mockResolvedValueOnce({
        expired: 1,
        auditsCreated: 1,
        tasksCreated: 1,
        missingRequesterProfiles: 0,
      });
    const dependencies: ApprovalExpiryDependencies = {
      approvals: {expirePendingBatch},
      batchSize: 2,
    };

    await expect(expireStaleApprovals(cronActor, asOf, dependencies))
      .resolves.toEqual({
        scanned: 3,
        expired: 3,
        auditsCreated: 3,
        tasksCreated: 2,
        skipped: 1,
        errors: {MISSING_REQUESTER_PROFILE: 1},
      });
    expect(expirePendingBatch).toHaveBeenCalledTimes(2);
    expect(expirePendingBatch).toHaveBeenNthCalledWith(
      1,
      cronActor,
      {asOf, limit: 2},
    );
  });

  it("returns a sanitized batch error and stops after repository failure", async () => {
    const expirePendingBatch = vi.fn<ApprovalExpiryRepository["expirePendingBatch"]>(
      async () => {
        throw new Error("private@example.test");
      },
    );

    await expect(expireStaleApprovals(cronActor, asOf, {
      approvals: {expirePendingBatch},
      batchSize: 10,
    })).resolves.toEqual({
      scanned: 0,
      expired: 0,
      auditsCreated: 0,
      tasksCreated: 0,
      skipped: 0,
      errors: {APPROVAL_EXPIRY_BATCH_FAILED: 1},
    });
    expect(expirePendingBatch).toHaveBeenCalledOnce();
  });

  it("requires the automation-cron system actor and a valid evaluation date", async () => {
    const expirePendingBatch = vi.fn<ApprovalExpiryRepository["expirePendingBatch"]>();
    const approvals = {expirePendingBatch};
    const actors = [
      {kind: "staff", userId: "auth-staff", profileId: "staff-1"},
      {kind: "member", userId: "auth-member", profileId: "member-1"},
      {kind: "system", userId: null, source: "stripe-webhook"},
    ] as const;

    for (const actor of actors) {
      await expect(expireStaleApprovals(
        actor,
        asOf,
        {approvals, batchSize: 10},
      )).rejects.toThrow("FORBIDDEN");
    }
    await expect(expireStaleApprovals(
      cronActor,
      new Date(Number.NaN),
      {approvals, batchSize: 10},
    )).rejects.toThrow("INVALID_APPROVAL_EXPIRY_AS_OF");
    expect(expirePendingBatch).not.toHaveBeenCalled();
  });

  it("claims the inclusive 72-hour cutoff and writes expiry, audit, and deduped task in one fenced transaction", async () => {
    const fake = sequenceDatabase([[
      {
        expired_count: 2,
        audit_count: 2,
        task_count: 2,
        missing_requester_count: 0,
      },
    ]]);
    const repository = createApprovalExpiryRepository(async () => fake.database);

    await expect(repository.expirePendingBatch(
      cronActor,
      {asOf, limit: 100},
    )).resolves.toEqual({
      expired: 2,
      auditsCreated: 2,
      tasksCreated: 2,
      missingRequesterProfiles: 0,
    });

    expect(fake.transactions()).toBe(1);
    expect(fake.committed()).toBe(true);
    expect(fake.commands).toHaveLength(1);
    const command = fake.commands[0]!;
    const normalized = command.sql.replace(/\s+/g, " ");
    expect(normalized).toMatch(/requested_at.*<=/i);
    expect(normalized).toMatch(/FOR UPDATE SKIP LOCKED/i);
    expect(normalized).toMatch(/UPDATE "approvals".*status = 'expired'.*status = 'pending'/i);
    expect(normalized).toMatch(/INSERT INTO "audit_events".*approval\.expired/i);
    expect(normalized).toMatch(/actor_type.*'system'/i);
    expect(normalized).toMatch(/INSERT INTO "staff_tasks".*approval-expiry:.*ON CONFLICT DO NOTHING/i);
    expect(normalized).not.toMatch(/email|phone|display_name|auth_user_id|payload/i);
    expect(command.params).toEqual(expect.arrayContaining([
      new Date(asOf.getTime() - 72 * HOUR_MS),
      asOf,
      100,
    ]));
  });

  it("does not commit the claim when its atomic side-effect statement fails", async () => {
    const fake = sequenceDatabase([], new Error("STAFF_TASK_WRITE_FAILED"));
    const repository = createApprovalExpiryRepository(async () => fake.database);

    await expect(repository.expirePendingBatch(
      cronActor,
      {asOf, limit: 10},
    )).rejects.toThrow("STAFF_TASK_WRITE_FAILED");
    expect(fake.transactions()).toBe(1);
    expect(fake.committed()).toBe(false);
  });
});
