import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createApprovalExpiryRepository} from "@/lib/db/repos/approvals";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

const dialect = new PgDialect();

describe("approval expiry orphan ordering", () => {
  it("orders taskable approvals ahead of requesterless rows before limiting the claim", async () => {
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
          missing_requester_count: 0,
        }],
      };
    };
    const database: AutomationDatabase = {
      execute,
      transaction: (work) => work({execute}),
    };
    const repository = createApprovalExpiryRepository(async () => database);

    await repository.expirePendingBatch(
      automationCronActor(),
      {asOf: new Date("2027-01-15T18:00:00.000Z"), limit: 10},
    );

    const normalized = commands[0]!.sql.replace(/\s+/g, " ");
    expect(normalized).toMatch(
      /ORDER BY .*requested_by_profile_id.*IS NULL.*requested_at.*LIMIT/i,
    );
  });
});
