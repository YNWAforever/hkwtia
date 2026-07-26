import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {
  createAutomationAdminRepository,
  type AutomationAdminExecutor,
} from "@/lib/db/repos/automation-admin";
import {M3_AUTOMATION_JOB_KINDS} from "@/lib/jobs/kinds";
import type {AdminActor} from "@/lib/membership/lifecycle";

const dialect = new PgDialect();
const staff: AdminActor = {
  kind: "staff",
  userId: "auth-staff",
  profileId: "staff-profile",
};

describe("automation jobs partial-index predicate", () => {
  it("uses the same literal kind allowlist as the partial index", async () => {
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const executor: AutomationAdminExecutor = {
      async execute(query) {
        const command = dialect.sqlToQuery(query);
        commands.push(command);
        if (/COUNT\(\*\) FILTER/i.test(command.sql)) {
          return {
            rows: [{due: 0, upcoming: 0, failed: 0, processing: 0}],
          };
        }
        return {rows: []};
      },
    };

    await createAutomationAdminRepository(async () => executor).getDashboard(
      staff,
      {
        asOf: new Date("2027-01-15T10:00:00.000Z"),
        cursor: null,
        limit: 25,
      },
    );

    const jobs = commands.find((command) =>
      /FROM "jobs"/i.test(command.sql))!;
    for (const kind of M3_AUTOMATION_JOB_KINDS) {
      expect(jobs.sql).toContain(`'${kind}'`);
      expect(jobs.params).not.toContain(kind);
    }
  });
});
