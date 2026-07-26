import {readFileSync} from "node:fs";

import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {
  createAutomationAdminRepository,
  type AutomationAdminExecutor,
} from "@/lib/db/repos/automation-admin";
import type {AdminActor} from "@/lib/membership/lifecycle";

const dialect = new PgDialect();
const staff: AdminActor = {
  kind: "staff",
  userId: "auth-staff",
  profileId: "staff-profile",
};
const jobId = "44444444-4444-4444-8444-444444444444";

describe("automation job operational identity", () => {
  it("projects a safe UUID for React keys without exposing runKey", async () => {
    const executor: AutomationAdminExecutor = {
      async execute(query) {
        const command = dialect.sqlToQuery(query);
        if (/COUNT\(\*\) FILTER/i.test(command.sql)) {
          return {
            rows: [{due: 0, upcoming: 0, failed: 0, processing: 0}],
          };
        }
        if (/FROM "jobs"/i.test(command.sql)) {
          return {
            rows: [{
              id: jobId,
              kind: "journey-runner",
              state: "completed",
              updated_at: new Date("2027-01-15T10:00:00.000Z"),
              error_code: null,
              run_key: "journey-runner:private-bucket",
            }],
          };
        }
        return {rows: []};
      },
    };

    const dashboard = await createAutomationAdminRepository(
      async () => executor,
    ).getDashboard(staff, {
      asOf: new Date("2027-01-15T10:00:00.000Z"),
      cursor: null,
      limit: 25,
    });

    expect(dashboard.jobs[0]).toEqual({
      id: jobId,
      kind: "journey-runner",
      state: "completed",
      updatedAt: "2027-01-15T10:00:00.000Z",
      errorCode: null,
    });
    expect(Object.keys(dashboard.jobs[0]!)).toEqual([
      "id",
      "kind",
      "state",
      "updatedAt",
      "errorCode",
    ]);
    expect(JSON.stringify(dashboard)).not.toContain(
      "journey-runner:private-bucket",
    );

    const component = readFileSync(
      "components/admin/automation-dashboard.tsx",
      "utf8",
    );
    expect(component).toContain("key={job.id}");
  });
});
