import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
import {createLeadReportRepository, parseLeadReportWindow} from "@/lib/db/repos/lead-report";

/**
 * Phase E, Task 10. The conversion report is read-only SQL aggregation, so these
 * tests pin the three things that go wrong silently: who may read it, which
 * window reaches the SQL, and how the estimate is priced.
 */
const dialect = new PgDialect();
type Row = Record<string, unknown>;

function fakeDatabase(responses: readonly Row[][]) {
  const statements: {text: string; params: unknown[]}[] = [];
  const queue = [...responses];
  return {
    statements,
    database: {
      async execute(query: unknown) {
        const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
        statements.push({text: rendered.sql, params: rendered.params});
        return {rows: queue.shift() ?? []};
      },
      async transaction() { throw new Error("read-only report must not open a transaction"); },
    },
  };
}

const admin = {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"} as const;
const member = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const now = new Date("2026-10-10T00:00:00.000Z");

const plans = async () => [
  {code: "community", audience: "individual", billingBehavior: "free", seatAllowance: 1, active: true, annualPriceHkd: null, monthlyPriceHkd: null, stripePriceReference: null},
  {code: "startup", audience: "company", billingBehavior: "paid", seatAllowance: 3, active: true, annualPriceHkd: 1200, monthlyPriceHkd: null, stripePriceReference: null},
  {code: "corporate", audience: "company", billingBehavior: "paid", seatAllowance: 10, active: true, annualPriceHkd: 5000, monthlyPriceHkd: null, stripePriceReference: null},
] as never;

describe("parseLeadReportWindow", () => {
  it.each([["30", "30"], ["90", "90"], ["180", "180"], ["all", "all"]])("keeps %s", (input, expected) => {
    expect(parseLeadReportWindow(input)).toBe(expected);
  });
  it.each([[undefined], [""], ["7"], ["ALL"], [["30", "90"]], ["90; drop table contacts"]])("maps %j to 90", (input) => {
    expect(parseLeadReportWindow(input)).toBe("90");
  });
});

describe("leadReportRepository.summary", () => {
  it.each([["member", member], ["anonymous", ANONYMOUS_ACTOR]] as const)("refuses a %s actor before the database loads", async (_n, forged) => {
    const loadDatabase = vi.fn();
    const repository = createLeadReportRepository({loadDatabase, loadPlans: plans, now: () => now});
    await expect(repository.summary(forged as never, "90")).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("shapes the aggregates and prices the estimate from the joined plans' annual prices", async () => {
    const fake = fakeDatabase([
      [{source: "event_guest", stage: "new", n: "4"}, {source: "event_guest", stage: "member", n: 1}, {source: "whatsapp", stage: "applied", n: 2}],
      [
        {owner_profile_id: "o1", owner_name: "Grace", leads: 5, invites_sent: 3, invites_opened: 2, applications: 1, members: 1},
        {owner_profile_id: null, owner_name: null, leads: 2, invites_sent: 0, invites_opened: 0, applications: 0, members: 0},
      ],
      [{sent: 3, opened: 2, applied: 2, paid: 2, median_hours: "36.5"}],
      [{invited: "startup", joined: "startup", n: 1}, {invited: "startup", joined: "corporate", n: 1}],
    ]);
    const repository = createLeadReportRepository({loadDatabase: async () => fake.database as never, loadPlans: plans, now: () => now});
    const report = await repository.summary(admin, "90");

    expect(report.bySource.event_guest).toMatchObject({new: 4, member: 1, contacted: 0});
    expect(report.bySource.whatsapp.applied).toBe(2);
    expect(report.bySource.import.new).toBe(0);
    expect(report.byOwner).toEqual([
      {ownerProfileId: "o1", ownerName: "Grace", leads: 5, invitesSent: 3, invitesOpened: 2, applications: 1, members: 1},
      {ownerProfileId: null, ownerName: null, leads: 2, invitesSent: 0, invitesOpened: 0, applications: 0, members: 0},
    ]);
    expect(report.invites).toEqual({
      sent: 3, opened: 2, applied: 2, paid: 2, medianInviteToPaidHours: 36.5,
      invitedVsJoined: [{invited: "startup", joined: "startup", count: 1}, {invited: "startup", joined: "corporate", count: 1}],
    });
    // 1 x startup (1,200) + 1 x corporate (5,000); a joined plan with no annual price counts zero.
    expect(report.estimatedFirstYearHkd).toBe(6200);
  });

  it("returns a null median when nobody has paid", async () => {
    const fake = fakeDatabase([[], [], [{sent: 1, opened: 0, applied: 0, paid: 0, median_hours: null}], []]);
    const repository = createLeadReportRepository({loadDatabase: async () => fake.database as never, loadPlans: plans, now: () => now});
    const report = await repository.summary(admin, "all");
    expect(report.invites.medianInviteToPaidHours).toBeNull();
    expect(report.estimatedFirstYearHkd).toBe(0);
  });

  it("binds a cutoff for 30 days and none for 'all'", async () => {
    const run = async (window: "30" | "all") => {
      const fake = fakeDatabase([[], [], [], []]);
      await createLeadReportRepository({loadDatabase: async () => fake.database as never, loadPlans: plans, now: () => now}).summary(admin, window);
      return fake.statements;
    };
    const thirty = await run("30");
    const cutoff = new Date("2026-09-10T00:00:00.000Z").toISOString();
    expect(thirty.every((s) => s.params.some((p) => (p instanceof Date ? p.toISOString() : p) === cutoff))).toBe(true);
    const all = await run("all");
    expect(all.every((s) => s.params.length === 0)).toBe(true);
  });

  it("only counts an active membership as paid", async () => {
    const fake = fakeDatabase([[], [], [], []]);
    await createLeadReportRepository({loadDatabase: async () => fake.database as never, loadPlans: plans, now: () => now}).summary(admin, "90");
    const joined = fake.statements.slice(2).map((s) => s.text.toLowerCase()).join(" ");
    expect(joined).toContain("'active'");
  });
});
