import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";

import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {applicationsRepository} from "@/lib/db/repos/applications";
import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {companiesRepository} from "@/lib/db/repos/companies";
import {membershipsRepository} from "@/lib/db/repos/memberships";

const actor = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const reposDirectory = path.resolve(__dirname, "../../lib/db/repos");

/**
 * Every member-actor path whose authorization predicate is an `EXISTS` over
 * `company_members` (or, for billing attempts, over `memberships`). Each one
 * either resolves or throws `FORBIDDEN` on an empty result — the statement is
 * built either way, and the statement is what this file is about.
 */
const memberScopedCalls = [
  ["companies.list", () => companiesRepository.list(actor)],
  ["companies.update", () => companiesRepository.update(actor, "company-b", {legalName: "Acme Limited"})],
  ["applications.list", () => applicationsRepository.list(actor)],
  ["applications.setCompany", () => applicationsRepository.setCompany(actor, "application-b", "company-b")],
  ["memberships.list", () => membershipsRepository.list(actor)],
  ["memberships.getBillingAccess", () => membershipsRepository.getBillingAccess(actor, "membership-a")],
  ["memberships.create", () => membershipsRepository.create(actor, {
    ownerUserId: actor.profileId,
    companyId: null,
    applicationId: "application-b",
    planCode: "community",
    status: "active",
    seatLimit: 1,
    billingInterval: "none",
  })],
  ["billingAttempts.getById", () => billingAttemptsRepository.getById(actor, "attempt-a")],
] as const;

describe("EXISTS authorization scopes render as executable Postgres", () => {
  /**
   * Postgres's grammar is `EXISTS select_with_parens`: a bare `EXISTS SELECT …`
   * is a syntax error, so a repository that emits one authorizes nothing — every
   * member-actor call into it throws at the database instead of running.
   *
   * Drizzle's `exists()` is literally `` sql`exists ${subquery}` `` and only
   * parenthesises a `Subquery` object; a raw `sql` fragment is pasted in bare.
   * These repositories all hand it hand-written SQL, which is why they spell the
   * keyword and its parentheses out themselves. Nothing else in the suite would
   * catch a regression: every other assertion here is on generated SQL *text*,
   * and no unit test runs a statement against Postgres.
   */
  it.each(memberScopedCalls)("%s parenthesises its EXISTS subquery", async (_name, invoke) => {
    const statements: string[] = [];
    database.current = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });

    await invoke().catch(() => undefined);

    const sql = statements.join("\n");
    expect(sql).toMatch(/\bexists\b/i);
    for (const [, following] of sql.matchAll(/\bexists\b\s*(.)/gi)) {
      expect(following).toBe("(");
    }
    // Hand-written parentheses are hand-countable ones. A subquery left open
    // does not parse either, and reads as innocently as a balanced one.
    for (const statement of statements) {
      expect(statement.split("(").length).toBe(statement.split(")").length);
    }
  });

  /**
   * The runtime check above only sees the predicates its calls happen to build.
   * This one covers the helpers no entry point here reaches, and any future
   * one: the import is the footgun, so no repository takes it. Should a
   * repository ever need `exists()` over a real `Subquery` object — the one
   * shape Drizzle does parenthesise — this is the test to amend, deliberately.
   */
  it("keeps every repository off drizzle's exists() helper", () => {
    const importsExists = /^import\s*\{[^}]*\bexists\b[^}]*\}\s*from\s*"drizzle-orm"/m;
    const offenders = readdirSync(reposDirectory)
      .filter((entry) => entry.endsWith(".ts"))
      .filter((entry) => importsExists.test(readFileSync(path.join(reposDirectory, entry), "utf8")));

    expect(offenders).toEqual([]);
  });
});
