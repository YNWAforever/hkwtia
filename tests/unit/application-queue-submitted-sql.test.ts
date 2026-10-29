import {PgDialect} from "drizzle-orm/pg-core";
import {expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async original => ({...(await original<typeof import("@/lib/db/repos/common")>()), getDb: async () => state.database}));
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import {createAdminDashboardRepository} from "@/lib/db/repos/admin-dashboard";
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const statuses = ["draft", "draft", "draft", "pending_review", "pending_review", "pending_payment"];
const rows = statuses.map((applicationState, i) => ({applicationId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, profileId: `fixture-${i}`, name: "Fixture", email: null, companyId: null, companyName: null, planCode: "startup", applicationState, step: "review", membershipId: null, membershipState: null, billingAttemptId: null, billingState: null, updatedAt: new Date("2026-10-25T00:00:00Z"), updatedKey: "2026-10-25 00:00:00+00"}));
it("executes queue and dashboard predicates against the same six-row fixture, comparing exact IDs", async () => {
  const dialect = new PgDialect();
  const execute = vi.fn(async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const query = dialect.sqlToQuery(statement);
    if (query.sql.includes("FILTER (WHERE")) return {rows: [{draft: 3, pending_review: 2, pending_payment: 1}]};
    const applicationQuery = query.sql.includes('"membership_applications"');
    const allowed = query.params.filter((value): value is string => typeof value === "string" && statuses.includes(value));
    const selected = rows.filter(row => allowed.includes(row.applicationState));
    if (query.sql.includes('AS "applicationId"')) {
      expect(query.sql).toMatch(/"status" in \(/);
      expect(allowed).toEqual(["pending_review", "pending_payment"]);
      return {rows: selected};
    }
    return {rows: [{count: applicationQuery && allowed.length ? selected.length : 0}]};
  });
  state.database = {execute};
  const page = await adminMembersRepository.getApplicationQueuePage(staff, {status: "submitted"});
  const counts = await createAdminDashboardRepository(async () => ({execute})).counts(staff);
  expect(page.items.map(row => row.applicationId)).toEqual(rows.slice(3).map(row => row.applicationId));
  expect(page.totalMatching).toBe(3);
  expect(counts.submittedApplications).toBe(page.totalMatching);
  expect(execute).toHaveBeenCalledTimes(13);
});
