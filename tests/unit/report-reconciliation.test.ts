import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {reconcileRenewalEvents, reconcileReportFacts} from "@/lib/admin/report-formulas";
import {getAdminReport, parseReportWindow, type ReportFactsReader} from "@/lib/admin/reports";
import {reportsRepository} from "@/lib/db/repos/reports";

const staff = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;

describe("report reconciliation", () => {
  beforeEach(() => { database.current = null; });

  it("converts inclusive Hong Kong calendar dates to a half-open UTC window", () => {
    expect(parseReportWindow({from: "2026-07-01", to: "2026-07-31"})).toEqual({
      display: {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"},
      utc: {
        from: new Date("2026-06-30T16:00:00.000Z"),
        toExclusive: new Date("2026-07-31T16:00:00.000Z"),
      },
    });
  });

  it.each([
    {from: "2026-02-30", to: "2026-03-01"},
    {from: "2026-07-02", to: "2026-07-01"},
    {from: "2026-07-01T00:00:00Z", to: "2026-07-31"},
  ])("rejects an invalid report window $from to $to", (window) => {
    expect(() => parseReportWindow(window)).toThrow();
  });

  it("hand-calculates duplicate and failed-then-paid renewal facts by distinct membership", () => {
    const renewal = reconcileRenewalEvents([
      {membershipId: "membership-a", renewalOrdinal: 1, type: "renewal_failed"},
      {membershipId: "membership-a", renewalOrdinal: 1, type: "renewal_paid"},
      {membershipId: "membership-a", renewalOrdinal: 1, type: "renewal_paid"},
      {membershipId: "membership-b", renewalOrdinal: 1, type: "renewal_failed"},
      {membershipId: "membership-c", renewalOrdinal: 2, type: "renewal_paid"},
      {membershipId: "membership-c", renewalOrdinal: 2, type: "renewal_failed"},
    ]);
    const report = reconcileReportFacts({
      revenueMemberships: [],
      renewal,
      funnel: {started: 6, profileCompleted: 5, checkoutOrReview: 4, activated: 3},
      attendance: {attended: 3, eligible: 4},
      atRiskCount: 2,
    }, {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"});

    expect(report.renewal).toEqual({numerator: 2, denominator: 3, percentage: 66.7});
    expect(report.firstYearRenewal).toEqual({numerator: 1, denominator: 2, percentage: 50});
    expect(report.funnel).toEqual({started: 6, profileCompleted: 5, checkoutOrReview: 4, activated: 3});
    expect(report.attendance).toEqual({numerator: 3, denominator: 4, percentage: 75});
    expect(report.atRiskCount).toBe(2);
  });

  it("uses null percentages for empty renewal and attendance cohorts", () => {
    const report = reconcileReportFacts({
      revenueMemberships: [], renewal: {paid: 0, due: 0, firstYearPaid: 0, firstYearDue: 0},
      funnel: {started: 0, profileCompleted: 0, checkoutOrReview: 0, activated: 0},
      attendance: {attended: 0, eligible: 0}, atRiskCount: 0,
    }, {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"});

    expect(report.renewal.percentage).toBeNull();
    expect(report.firstYearRenewal.percentage).toBeNull();
    expect(report.attendance.percentage).toBeNull();
  });

  it("passes exact half-open UTC boundaries to an Actor-first reader", async () => {
    let seenActor: unknown;
    let seenWindow: unknown;
    const reader: ReportFactsReader = {readFacts: async (actor, window) => {
      seenActor = actor;
      seenWindow = window;
      return {
        revenueMemberships: [], renewal: {paid: 0, due: 0, firstYearPaid: 0, firstYearDue: 0},
        funnel: {started: 0, profileCompleted: 0, checkoutOrReview: 0, activated: 0},
        attendance: {attended: 0, eligible: 0}, atRiskCount: 0,
      };
    }};

    await getAdminReport(staff, {from: "2026-07-01", to: "2026-07-31"}, reader);

    expect(seenActor).toBe(staff);
    expect(seenWindow).toEqual({from: new Date("2026-06-30T16:00:00.000Z"), toExclusive: new Date("2026-07-31T16:00:00.000Z")});
  });

  it("rejects non-staff actors before reading report facts", async () => {
    let called = false;
    const reader: ReportFactsReader = {readFacts: async () => { called = true; throw new Error("must not read"); }};
    await expect(getAdminReport({kind: "member", userId: "auth-member", profileId: "member-1"}, {from: "2026-07-01", to: "2026-07-31"}, reader)).rejects.toThrow("FORBIDDEN");
    expect(called).toBe(false);
  });

  it("reads one bounded aggregate row using half-open windows and shared at-risk thresholds", async () => {
    const queries: string[] = [];
    const paramsSeen: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      queries.push(query);
      paramsSeen.push(params);
      return {rows: [{
        revenueMemberships: [{status: "active", interval: "annual", annualPriceHkd: 1800, monthlyPriceHkd: null, count: 2}],
        renewalPaid: 2, renewalDue: 3, firstYearPaid: 1, firstYearDue: 2,
        funnelStarted: 6, funnelProfileCompleted: 5, funnelCheckoutOrReview: 4, funnelActivated: 3,
        attendanceAttended: 3, attendanceEligible: 4, atRiskCount: 2,
      }]};
    });

    const from = new Date("2026-06-30T16:00:00.000Z");
    const toExclusive = new Date("2026-07-31T16:00:00.000Z");
    const facts = await reportsRepository.readFacts(staff, {from, toExclusive});

    expect(facts.renewal).toEqual({paid: 2, due: 3, firstYearPaid: 1, firstYearDue: 2});
    expect(facts.revenueMemberships[0]).toMatchObject({count: 2});
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/bool_or/i);
    expect(queries[0]).toMatch(/count\s*\(\s*distinct/i);
    expect(queries[0]).toMatch(/occurred_at[^]*>=/i);
    expect(queries[0]).toMatch(/occurred_at[^]*</i);
    expect(queries[0]).toMatch(/score[^]*<[^]*20/i);
    expect(queries[0]).toMatch(/interval[^]*60 day/i);
    expect(paramsSeen.flat()).toContainEqual(from);
    expect(paramsSeen.flat()).toContainEqual(toExclusive);
  });

  it("authorizes before loading the reports database", async () => {
    let queries = 0;
    database.current = drizzle(async () => { queries += 1; return {rows: []}; });
    await expect(reportsRepository.readFacts({kind: "member", userId: "auth-member", profileId: "member-1"}, {
      from: new Date("2026-06-30T16:00:00.000Z"), toExclusive: new Date("2026-07-31T16:00:00.000Z"),
    })).rejects.toThrow("FORBIDDEN");
    expect(queries).toBe(0);
  });
});