import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {
    ...actual,
    getDb: async () => database,
  };
});

import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createRenewalEnrollmentsRepository,
} from "@/lib/db/repos/renewal-enrollments";
import {runProductionRenewal} from "@/lib/jobs/runners";

const fixedNow = new Date("2027-01-01T00:00:00.000Z");
const billingPeriodEnd = new Date("2027-12-31T00:00:00.000Z");
const dialect = new PgDialect();

describe("production renewal dependency wiring", () => {
  beforeEach(() => {
    database.execute.mockReset();
  });

  it("uses the real cron-authorized projection without reading unrelated membership or profile fields", async () => {
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    database.execute.mockImplementation(async (query) => {
      const command = dialect.sqlToQuery(query);
      commands.push(command);
      if (/SELECT[\s\S]+FROM "memberships"/i.test(command.sql)) {
        return {
          rows: [{
            membership_id: "membership-1",
            profile_id: "profile-1",
            billing_period_end: billingPeriodEnd,
          }],
        };
      }
      if (/INSERT INTO "journey_state"/i.test(command.sql)) {
        return {rows: [{id: "journey-state-1"}]};
      }
      throw new Error("UNEXPECTED_RENEWAL_QUERY");
    });

    await expect(runProductionRenewal(fixedNow)).resolves.toMatchObject({
      scanned: 1,
      createdSteps: 4,
      existingSteps: 0,
      skipped: 0,
      errors: {},
    });

    const projection = commands.find((command) =>
      /SELECT[\s\S]+FROM "memberships"/i.test(command.sql));
    expect(projection).toBeDefined();
    const sql = projection!.sql.replace(/\s+/g, " ");
    expect(sql).toMatch(
      /SELECT .*membership_id.*COALESCE\(.*owner_user_id.*applicant_user_id.*\).*profile_id.*billing_period_end.*FROM "memberships"/i,
    );
    expect(sql).not.toMatch(
      /display_name|email|phone|company_id|plan_code|status|stripe_|billing_period_start|created_at|updated_at/i,
    );
  });

  it("rejects stripe-webhook access to the renewal projection before opening the database", async () => {
    const loadDatabase = vi.fn(async () => database);
    const repository = createRenewalEnrollmentsRepository(loadDatabase);

    await expect(repository.listDue({
      kind: "system",
      userId: null,
      source: "stripe-webhook",
    })).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();

    database.execute.mockResolvedValueOnce({rows: []});
    await expect(repository.listDue(automationCronActor())).resolves.toEqual([]);
  });
});
