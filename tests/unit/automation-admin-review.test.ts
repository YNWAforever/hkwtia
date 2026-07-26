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
const asOf = new Date("2027-01-15T10:00:00.000Z");
const expectedKinds = [
  "journey-runner",
  "renewal-runner",
  "engagement-score",
  "approvals-expirer",
  "worker-alert",
] as const;

describe("automation admin review regressions", () => {
  it("filters to the five persisted M3 job kinds before ordering and limiting", async () => {
    const unrelated = Array.from({length: 12}, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      kind: index === 0 ? "stripe.invoice.paid" : `unrelated-${index}`,
      state: "completed",
      updated_at: new Date(Date.UTC(2027, 0, 16, 0, 0, 0) - index),
      error_code: null,
    }));
    const automation = expectedKinds.map((kind, index) => ({
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      kind,
      state: "completed",
      updated_at: new Date(Date.UTC(2027, 0, 15, 0, 0, 0) - index),
      error_code: null,
    }));
    const jobSource = [...unrelated, ...automation];
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const executor: AutomationAdminExecutor = {
      async execute(query) {
        const command = dialect.sqlToQuery(query);
        commands.push(command);
        if (/FROM "jobs"/i.test(command.sql)) {
          const parameterKinds = command.params.filter(
            (value): value is typeof expectedKinds[number] =>
              typeof value === "string"
              && expectedKinds.includes(value as typeof expectedKinds[number]),
          );
          const hasLiteralKinds = expectedKinds.every(
            (kind) => command.sql.includes(`'${kind}'`),
          );
          const filtered = parameterKinds.length === expectedKinds.length
            || hasLiteralKinds;
          return {
            rows: (filtered
              ? jobSource.filter((row) =>
                  expectedKinds.includes(
                    row.kind as typeof expectedKinds[number],
                  ))
              : jobSource).slice(0, 10),
          };
        }
        if (/FROM "journey_state"/i.test(command.sql)) {
          return commands.length === 1
            ? {rows: [{due: 0, upcoming: 0, failed: 0, processing: 0}]}
            : {rows: []};
        }
        throw new Error(`UNEXPECTED_SQL:${command.sql}`);
      },
    };

    const dashboard = await createAutomationAdminRepository(
      async () => executor,
    ).getDashboard(staff, {asOf, cursor: null, limit: 25});

    expect(dashboard.jobs.map((job) => job.kind)).toEqual(expectedKinds);
    const jobSql = commands.find((command) =>
      /FROM "jobs"/i.test(command.sql))!.sql.replace(/\s+/g, " ");
    expect(jobSql).toMatch(
      /FROM "jobs" WHERE .*kind.*IN .* ORDER BY .*updated_at.*DESC.*id.*DESC LIMIT/i,
    );
    expect(jobSql).not.toContain("stripe");
  });
});
