import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createApprovalExpiryRepository} from "@/lib/db/repos/approvals";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const dialect = new PgDialect();

describe("approval expiry orphan safety", () => {
  it("reports requesterless candidates without committing a taskless expiry", async () => {
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const execute = async (
      query: Parameters<AutomationSqlExecutor["execute"]>[0],
    ) => {
      commands.push(dialect.sqlToQuery(query));
      return {
        rows: [{
          expired_count: 0,
          audit_count: 0,
          task_count: 0,
          missing_requester_count: 1,
        }],
      };
    };
    const database: AutomationDatabase = {
      execute,
      transaction: (work) => work({execute}),
    };
    const repository = createApprovalExpiryRepository(async () => database);

    await expect(repository.expirePendingBatch(
      automationCronActor(),
      {asOf: new Date("2027-01-15T18:00:00.000Z"), limit: 10},
    )).resolves.toMatchObject({
      expired: 0,
      auditsCreated: 0,
      tasksCreated: 0,
      missingRequesterProfiles: 1,
    });

    const normalized = commands[0]!.sql.replace(/\s+/g, " ");
    expect(normalized)
      .toMatch(/candidate_approvals\.requested_by_profile_id IS NOT NULL/i);
    expect(normalized)
      .toMatch(/FROM candidate_approvals.*requested_by_profile_id IS NULL/i);
  });
});
