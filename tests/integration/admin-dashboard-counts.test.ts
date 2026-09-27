import {describe, expect, it, vi} from "vitest";
import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";

import {createAdminDashboardRepository, adminDashboardRepository} from "@/lib/db/repos/admin-dashboard";
import {finalAuditIsolatedDatabaseUrl} from "@/tests/fixtures/audit-isolated-db";
import {listPendingApprovals} from "@/lib/admin/approvals";
import {listAtRiskMembers} from "@/lib/admin/at-risk";
import {listOpenTasks} from "@/lib/admin/inbox";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {companyProfilesRepository} from "@/lib/db/repos/company-profiles";
import {adminPostsRepository} from "@/lib/db/repos/admin-posts";

const actor = {kind: "staff" as const, userId: "staff-1", profileId: "staff-1"};

describe("admin dashboard count contract", () => {
  it("runs six bounded aggregate reads and preserves an unavailable tile", async () => {
    const statements: string[] = [];
    const database = {execute: vi.fn(async (query: SQL) => {
      const statement = new PgDialect().sqlToQuery(query).sql;
      statements.push(statement);
      if (statement.includes('"engagement_scores"')) throw new Error("database unavailable");
      return {rows: [{count: "7"}]};
    })};
    const repository = createAdminDashboardRepository(async () => database as never);
    const counts = await repository.counts(actor, new Date("2026-09-28T00:00:00.000Z"));
    expect(counts).toEqual({approvals: 7, atRisk: null, listings: 7, profiles: 7, openTasks: 7, draftNews: 7});
    expect(statements).toHaveLength(6);
    expect(statements[1]).toMatch(/UNION ALL/i);
    expect(statements.every((statement) => /count\s*\(/i.test(statement) && !/select\s+\*/i.test(statement))).toBe(true);
  });

  it("rejects non-admin actors before any SQL", async () => {
    const database = {execute: vi.fn()};
    const repository = createAdminDashboardRepository(async () => database as never);
    await expect(repository.counts({kind: "member", userId: "m", profileId: "m"}, new Date())).rejects.toThrow("FORBIDDEN");
    expect(database.execute).not.toHaveBeenCalled();
  });
});


describe.skipIf(!finalAuditIsolatedDatabaseUrl())("dashboard parity on isolated Neon", () => {
  it("matches the six existing list readers at the same reference instant", async () => {
    const asOf = new Date("2026-09-28T00:00:00.000Z");
    const counts = await adminDashboardRepository.counts(actor, asOf);
    const [approvals, atRisk, listings, profiles, tasks, posts] = await Promise.all([
      listPendingApprovals(actor),
      listAtRiskMembers(actor, {asOf}),
      showcaseRepository.listForReview(actor),
      companyProfilesRepository.listForReview(actor),
      listOpenTasks(actor),
      adminPostsRepository.listForAdmin(actor),
    ]);
    expect(counts).toEqual({
      approvals: approvals.length,
      atRisk: atRisk.length,
      listings: listings.length,
      profiles: profiles.length,
      openTasks: tasks.length,
      draftNews: posts.filter((post) => post.publishedAt === null).length,
    });
  }, 30_000);
});
