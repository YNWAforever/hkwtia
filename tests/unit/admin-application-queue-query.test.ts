import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/common")>()),
  getDb: async () => state.database,
}));

import {
  adminMembersRepository,
  applicationQueueQuerySchema,
} from "@/lib/db/repos/admin-members";

const staff = {
  kind: "staff" as const,
  userId: "staff-a",
  profileId: "staff-a",
};
const dialect = new PgDialect();

describe("application queue filtering and counts", () => {
  beforeEach(() => {
    const statements: string[] = [];
    const execute = vi.fn(async (query: unknown) => {
      const rendered = dialect.sqlToQuery(query as never);
      statements.push(rendered.sql);
      if (rendered.sql.includes("FILTER (WHERE")) {
        return {
          rows: [
            {
              draft: 1,
              pending_payment: 4,
              pending_review: 2,
            },
          ],
        };
      }
      return {
        rows: [
          {
            applicationId: "11111111-1111-4111-8111-111111111111",
            profileId: "member-a",
            name: "Synthetic Applicant",
            email: "applicant@example.test",
            companyId: null,
            companyName: null,
            planCode: "startup",
            applicationState: "pending_review",
            step: "review",
            membershipId: null,
            membershipState: null,
            billingAttemptId: null,
            billingState: null,
            updatedAt: new Date("2026-10-17T01:00:00.000Z"),
            updatedKey: "2026-10-17 01:00:00+00",
          },
          {
            applicationId: "22222222-2222-4222-8222-222222222222",
            profileId: "member-b",
            name: "Synthetic Applicant 2",
            email: "applicant2@example.test",
            companyId: null,
            companyName: null,
            planCode: "startup",
            applicationState: "pending_review",
            step: "review",
            membershipId: null,
            membershipState: null,
            billingAttemptId: null,
            billingState: null,
            updatedAt: new Date("2026-10-17T02:00:00.000Z"),
            updatedKey: "2026-10-17 02:00:00+00",
          },
        ],
      };
    });
    state.database = { execute };
    Object.defineProperty(state, "statements", {
      value: statements,
      configurable: true,
    });
  });

  it("accepts an explicit newest/oldest queue order", () => {
    expect(
      applicationQueueQuerySchema.parse({
        status: "pending_review",
        sort: "updated_asc",
      }).sort,
    ).toBe("updated_asc");
  });

  it("returns counts and a total from the same search scope as the page", async () => {
    const page = await adminMembersRepository.getApplicationQueuePage(staff, {
      status: "pending_review",
      search: "Synthetic",
      sort: "updated_asc",
      limit: 1,
    });
    expect(page.totalMatching).toBe(2);
    expect(page.counts).toEqual({
      draft: 1,
      pending_payment: 4,
      pending_review: 2,
    });

    const statements = (
      state as unknown as { statements: readonly string[] }
    ).statements;
    const countQuery = statements.find((statement) =>
      statement.includes("FILTER (WHERE"),
    );
    const pageQuery = statements.find(
      (statement) => !statement.includes("FILTER (WHERE"),
    );
    expect(countQuery).toMatch(/"membership_applications"\."status"\s*=\s*'draft'/);
    expect(pageQuery).toMatch(
      /order by\s+"membership_applications"\."updated_at"\s+asc/i,
    );
  });
});
