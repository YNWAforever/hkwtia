import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";

import {sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {applicationsRepository} from "@/lib/db/repos/applications";
import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import {companiesRepository} from "@/lib/db/repos/companies";
import {notificationActor} from "@/lib/db/repos/deliveries";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
import {createMessageEligibilityRepository} from "@/lib/db/repos/message-eligibility";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {segmentFilterSchema} from "@/lib/admin/segment-schema";
import {contactPredicates, memberPredicates} from "@/lib/db/repos/segments";
import {
  createWoztellInboundEventsRepository,
  woztellWebhookActor,
} from "@/lib/db/repos/woztell-inbound-events";

const actor = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const reposDirectory = path.resolve(__dirname, "../../lib/db/repos");

/**
 * Every scan below reads SQL through this, because an SQL comment is not SQL.
 * House style puts `--` prose inside these hand-written statements — the member
 * anchor in `message-eligibility.ts` explains its withdrawal join that way —
 * and the assertions here are a keyword scan and a parenthesis count over raw
 * text. The first comment sentence to use the word "exists" in English, or to
 * put a bracketed aside in a comment, failed the pin while the generated SQL
 * was perfectly well formed. `tests/unit/message-eligibility.test.ts`'s
 * `flatten` records the same hazard from the other direction.
 */
function withoutComments(statements: readonly string[]): string[] {
  return statements.map((statement) => statement.replace(/--[^\n]*/g, " "));
}
const segmentEventId = "33333333-3333-4333-8333-333333333333";
const segmentNow = new Date("2026-09-11T00:00:00.000Z");

/**
 * C2 Task 7. The segment event-state filter is the third hand-written `EXISTS`
 * family in the tree and the first one outside an authorization predicate: it
 * decides who a campaign addresses. `not_registered` is the dangerous member of
 * the pair — a `NOT EXISTS` whose closing parenthesis lands in the wrong place
 * either fails to parse or, worse, inverts a different subexpression and
 * silently selects the people who DID register. It is built as a bare `sql`
 * fragment, so nothing but this file renders it before Postgres does.
 */
const segmentPredicateCalls = [
  ["segments.memberPredicates(event registered)", () =>
    memberPredicates(segmentFilterSchema.parse({event: {eventId: segmentEventId, state: "registered"}}), segmentNow)],
  ["segments.memberPredicates(event not_registered)", () =>
    memberPredicates(segmentFilterSchema.parse({event: {eventId: segmentEventId, state: "not_registered"}}), segmentNow)],
  ["segments.contactPredicates(event attended)", () =>
    contactPredicates(segmentFilterSchema.parse({audience: "contacts", event: {eventId: segmentEventId, state: "attended"}}))],
  ["segments.contactPredicates(event not_registered)", () =>
    contactPredicates(segmentFilterSchema.parse({audience: "contacts", event: {eventId: segmentEventId, state: "not_registered"}}))],
] as const;

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

/**
 * The same hazard, reached through a capability actor rather than a member one
 * (programme §9 / Phase C1 S-14). `recordOutboundEcho` resolves an echo's thread
 * through three hand-written `EXISTS` arms — the recipient's contact link, the
 * member's own WhatsApp number, and the normalised sender recorded in message
 * metadata — because D-6 keeps the conversation owner key an HMAC the repository
 * cannot recompute. It runs inside a transaction, which the pg-proxy driver does
 * not implement, so the loader below hands it the proxy database with a
 * pass-through `transaction`. C2 Task 3 appends cases here; whoever lands second
 * merges rather than replaces.
 */
const capabilityScopedCalls = [
  ["woztellInboundEvents.recordOutboundEcho", (database: AutomationDatabase) =>
    createWoztellInboundEventsRepository(
      () => new Date("2026-09-10T09:00:00.000Z"),
      async () => database,
    ).recordOutboundEcho(woztellWebhookActor(), {
      recipient: "+85290000000",
      text: "Thanks — someone will come back to you shortly.",
      providerMessageId: "wamid.echo.scope",
      origin: "MANUAL",
      sentAt: new Date("2026-09-10T08:59:00.000Z"),
    })],
  /**
   * C2 Task 3. `factsFor` is the dispatcher's door onto the same private facts
   * loader the staff door uses, and that loader carries two hand-written
   * `EXISTS` sub-selects — one per suppression channel — plus the scalar
   * sub-select that derives a linked member's recorded withdrawal. Both
   * recipient kinds are exercised because the anchor differs per kind and only
   * the outer SELECT is shared.
   */
  ["messageEligibility.factsFor(member)", (database: AutomationDatabase) =>
    createMessageEligibilityRepository(async () => database)
      .factsFor(notificationActor("campaign"), {kind: "member", profileId: "member-a"})],
  ["messageEligibility.factsFor(contact)", (database: AutomationDatabase) =>
    createMessageEligibilityRepository(async () => database)
      .factsFor(notificationActor("campaign"), {kind: "contact", contactId: "11111111-1111-4111-8111-111111111111"})],
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

    const rendered = withoutComments(statements);
    const sql = rendered.join("\n");
    expect(sql).toMatch(/\bexists\b/i);
    for (const [, following] of sql.matchAll(/\bexists\b\s*(.)/gi)) {
      expect(following).toBe("(");
    }
    // Hand-written parentheses are hand-countable ones. A subquery left open
    // does not parse either, and reads as innocently as a balanced one.
    for (const statement of rendered) {
      expect(statement.split("(").length).toBe(statement.split(")").length);
    }
  });

  it.each(capabilityScopedCalls)("%s parenthesises its EXISTS subquery", async (_name, invoke) => {
    const statements: string[] = [];
    const proxy = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });
    const database = {
      execute: (query: Parameters<AutomationDatabase["execute"]>[0]) => proxy.execute(query),
      transaction: async <T,>(work: (tx: AutomationDatabase) => Promise<T>) => work(database),
    } as AutomationDatabase;

    await invoke(database).catch(() => undefined);

    const rendered = withoutComments(statements);
    const sql = rendered.join("\n");
    expect(sql).toMatch(/\bexists\b/i);
    for (const [, following] of sql.matchAll(/\bexists\b\s*(.)/gi)) {
      expect(following).toBe("(");
    }
    for (const statement of rendered) {
      expect(statement.split("(").length).toBe(statement.split(")").length);
    }
  });

  it.each(segmentPredicateCalls)("%s parenthesises its EXISTS subquery", async (_name, build) => {
    const statements: string[] = [];
    const proxy = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });

    await proxy.execute(sql`SELECT 1 WHERE ${build()}`).catch(() => undefined);

    const stripped = withoutComments(statements);
    const rendered = stripped.join("\n");
    expect(rendered).toMatch(/\bexists\b/i);
    for (const [, following] of rendered.matchAll(/\bexists\b\s*(.)/gi)) {
      expect(following).toBe("(");
    }
    for (const statement of stripped) {
      expect(statement.split("(").length).toBe(statement.split(")").length);
    }
  });

  /**
   * C2 Task 8. The campaign audience is the COMPOSITION of two hand-written
   * families — `projectedAudience`'s UNION ALL arms and
   * `recipientFactsProjection`'s two suppression sub-selects, wrapped in a
   * re-join to `profiles` and `contacts`. Each half is rendered above on its
   * own; only rendering them together proves the composition is a statement
   * Postgres accepts, and this is the statement that decides who a blast
   * reaches. The mixed `audience: "both"` filter is the shape that exercises
   * every arm at once.
   */
  it("renders the campaign audience with balanced, parenthesised EXISTS subqueries", async () => {
    const statements: string[] = [];
    const proxy = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });

    await campaignsRepository.audienceForSegment(
      {kind: "staff", userId: "staff-1", profileId: "staff-1"},
      proxy,
      segmentFilterSchema.parse({audience: "both", event: {eventId: segmentEventId, state: "not_registered"}}),
    );

    const stripped = withoutComments(statements);
    const rendered = stripped.join("\n");
    expect(rendered).toMatch(/\bexists\b/i);
    for (const [, following] of rendered.matchAll(/\bexists\b\s*(.)/gi)) {
      expect(following).toBe("(");
    }
    for (const statement of stripped) {
      expect(statement.split("(").length).toBe(statement.split(")").length);
    }
  });

  /**
   * C2 Task 9. One row per PERSON, and this is a SHAPE assertion because there
   * is no database in this suite to prove it behaviourally — the one Postgres
   * harness in the tree (`tests/unit/task7-postgres-integration.test.ts`) is
   * gated on `RUN_POSTGRES_INTEGRATION=1`, is not run by CI, and its hand-written
   * DDL predates `contacts` and `message_suppressions` entirely, so it cannot
   * execute this statement at all. The expectations below are therefore each a
   * piece of the defect, spelled so that deleting any one of them fails here
   * rather than in a blast.
   *
   * A member and the contact that links back to them are two rows of ONE person
   * (`contactArm` does not drop a contact carrying a `profile_id`); both partial
   * unique indexes on `campaign_recipients` are satisfied by that pair because
   * they are on different columns, so `insertRecipients`' bare
   * `onConflictDoNothing()` cannot collapse it. Before the `DISTINCT ON` the
   * preview a second admin approves counted that person twice, the report read
   * 20 recipients for 19 people, and a WhatsApp blast sent one marketing
   * template twice to one number.
   *
   * The last expectation is the other half. The collapse keeps the MEMBER row,
   * and without the member arm reaching its linked contact that row reads
   * `whatsapp_opted_out_at` as NULL for somebody whose STOP resolved no profile
   * — dropping a withdrawal, which is worse than the duplicate it replaced.
   */
  it("collapses the two identities of one person to a single campaign audience row", async () => {
    const statements: string[] = [];
    const proxy = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });

    await campaignsRepository.audienceForSegment(
      {kind: "staff", userId: "staff-1", profileId: "staff-1"},
      proxy,
      segmentFilterSchema.parse({audience: "both"}),
    );

    const rendered = statements.join("\n");
    expect(rendered).toMatch(/select\s+distinct\s+on\s*\(\s*person\.person_key\s*\)/i);
    expect(rendered).toMatch(/'profile:'\s*\|\|/);
    expect(rendered).toMatch(/'contact:'\s*\|\|/);
    expect(rendered).toMatch(/order\s+by\s+person\.person_key,\s*\(\s*person\.kind\s*=\s*'member'\s*\)\s+desc/i);
    expect(rendered).toMatch(/"contacts"\."profile_id"\s*=\s*audience\."id"/i);
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
