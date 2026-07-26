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

describe("automation admin read performance", () => {
  it("starts independent counts, jobs, and rows reads in parallel", async () => {
    let active = 0;
    let maxActive = 0;
    const executor: AutomationAdminExecutor = {
      async execute(query) {
        const command = dialect.sqlToQuery(query);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;

        if (/COUNT\(\*\) FILTER/i.test(command.sql)) {
          return {
            rows: [{due: 0, upcoming: 0, failed: 0, processing: 0}],
          };
        }
        if (/FROM "jobs"/i.test(command.sql)) {
          return {rows: []};
        }
        if (/FROM "journey_state"/i.test(command.sql)) {
          return {rows: []};
        }
        throw new Error(`UNEXPECTED_SQL:${command.sql}`);
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

    expect(maxActive).toBe(3);
  });
});
