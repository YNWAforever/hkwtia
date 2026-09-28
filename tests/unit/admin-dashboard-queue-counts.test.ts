import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {createAdminDashboardRepository} from "@/lib/db/repos/admin-dashboard";

const staff = {kind: "staff" as const, userId: "staff-test", profileId: "staff-test"};

describe("admin dashboard review queue", () => {
  it("counts only listings in the pending review state", async () => {
    const statements: string[] = [];
    const database = {execute: async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      statements.push(new PgDialect().sqlToQuery(statement).sql);
      return [{count: "2"}];
    }};
    const counts = await createAdminDashboardRepository(async () => database).counts(staff);
    expect(counts.listings).toBe(2);
    const listingQuery = statements.find((statement) => statement.includes('"showcase_listings"'));
    expect(listingQuery).toMatch(/"showcase_listings"\."status"\s*=\s*'pending_review'/);
  });
});