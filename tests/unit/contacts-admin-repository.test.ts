import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";
import {ZodError} from "zod";

import {contactPipelineInput, contactReturnPath} from "@/lib/admin/contact-action-core";
import {createContactsRepository, contactWriterActor} from "@/lib/db/repos/contacts";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";

/**
 * Phase C2 Task 4 (C-4). The read surface `/admin/contacts` stands on.
 *
 * `contacts` has been written since Phase A and read by nothing: no staff screen
 * ever showed a prospect, so `stage`, `owner_profile_id` and `tags` have sat at
 * their defaults while the funnel they model filled up. These are the first
 * reads, and the first staff writes.
 *
 * The gate is `requireAdmin`, NOT `requireContactWriter`. Widening the capability
 * actor to cover staff (or adding a permissive branch to it) would make the
 * webhook's writer forgeable from a `"use server"` boundary, which is the whole
 * reason the capability exists (boundary 10).
 */

const dialect = new PgDialect();

type Row = Record<string, unknown>;

function contactRow(overrides: Row = {}): Row {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    display_name: "Ada Wong",
    email: "ada@example.hk",
    phone_e164: "+85291234567",
    stage: "new",
    source: "interest_form",
    owner_profile_id: null,
    owner_name: null,
    profile_id: null,
    company_id: null,
    tags: [],
    whatsapp_opt_in: false,
    whatsapp_opted_out_at: null,
    last_inbound_at: null,
    conversation_id: null,
    duplicate_count: 1,
    total_count: 1,
    created_at: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Records the SQL it was handed, keeping statements issued inside `transaction`
 * separate from statements issued outside one — the audit assertion below is
 * only meaningful if the two are distinguishable, because an audit row written
 * beside the update but outside its transaction is exactly the defect boundary
 * 11 exists to prevent.
 */
type Statement = Readonly<{text: string; params: readonly unknown[]}>;

function fakeDatabase(responses: readonly Row[][] = [[contactRow()]]) {
  const outer: Statement[] = [];
  const transactions: Statement[][] = [];
  const queue = [...responses];
  const render = (query: unknown): Statement => {
    const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
    return {text: rendered.sql, params: rendered.params};
  };
  const next = () => queue.length > 1 ? queue.shift()! : (queue[0] ?? []);
  const database = {
    async execute(query: unknown) {
      outer.push(render(query));
      return {rows: next()};
    },
    async transaction<T>(work: (transaction: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>): Promise<T> {
      const statements: Statement[] = [];
      transactions.push(statements);
      return work({
        async execute(query: unknown) {
          statements.push(render(query));
          return {rows: next()};
        },
      });
    },
  };
  return {database, outer, transactions};
}

const admin = {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"} as const;
const member = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const contactId = "11111111-1111-4111-8111-111111111111";

describe("contactsRepository pipeline reads", () => {
  it.each([
    ["member", member],
    ["anonymous", ANONYMOUS_ACTOR],
    ["contact writer", contactWriterActor("whatsapp")],
  ] as const)("refuses a %s actor on every pipeline method before the database loads", async (_name, forged) => {
    const loadDatabase = vi.fn();
    const repository = createContactsRepository(loadDatabase);

    await expect(repository.list(forged as never, {})).rejects.toThrow("FORBIDDEN");
    await expect(repository.get(forged as never, contactId)).rejects.toThrow("FORBIDDEN");
    await expect(repository.updatePipeline(forged as never, contactId, {stage: "contacted"}))
      .rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("refuses a stage filter the enum does not carry, before the database loads", async () => {
    const loadDatabase = vi.fn();
    const repository = createContactsRepository(loadDatabase);

    await expect(repository.list(admin, {stage: ["prospect"]})).rejects.toThrow(ZodError);
    // A filter arrives from a `<form method="get">`, so it is untrusted input
    // shaped by whoever typed the URL. Parsing before the connection is what
    // keeps a mistyped query string from becoming a database round trip.
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("carries how many rows share an email so staff can see the duplicates", async () => {
    const fake = fakeDatabase([[
      contactRow({duplicate_count: 2, total_count: 2}),
      contactRow({id: "22222222-2222-4222-8222-222222222222", source: "event_guest", duplicate_count: 2, total_count: 2}),
    ]]);
    const repository = createContactsRepository(async () => fake.database as never);

    const page = await repository.list(admin, {});

    expect(page.items.map((row) => row.duplicateCount)).toEqual([2, 2]);
    expect(page.total).toBe(2);
    const statement = (fake.outer[0]?.text ?? "").replace(/\s+/g, " ");
    // An interest-form contact with no phone has no conflict target on email by
    // design (`contacts_email_idx` is deliberately not unique), so duplicates
    // are expected rather than a bug — the count has to be a fact about the
    // TABLE, which is why the window runs before the filters rather than after.
    expect(statement).toMatch(/partition by lower\(/i);
    expect(statement.indexOf("PARTITION BY lower(")).toBeLessThan(statement.indexOf("WHERE"));
  });

  it("pages with a parenthesised keyset predicate", async () => {
    const cursor = Buffer
      .from(JSON.stringify({createdAt: "2026-09-01T00:00:00.000Z", id: contactId}), "utf8")
      .toString("base64url");
    const fake = fakeDatabase([[contactRow({total_count: 3})]]);
    const repository = createContactsRepository(async () => fake.database as never);

    await repository.list(admin, {cursor, limit: 1});

    // Bracketed, though it is the sole WHERE term of its query level today: a
    // bare `a < x OR (a = x AND b < y)` beside any second term silently becomes
    // "everything older OR this narrow tail" (plan S-10, on the same hazard in
    // the segment audience cursor).
    expect((fake.outer[0]?.text ?? "").replace(/\s+/g, " "))
      .toMatch(/WHERE \(created_at < \$\d+ or \(created_at = \$\d+ and id < \$\d+\)\)/i);
  });

  it("refuses a cursor nobody minted, before the database loads", async () => {
    const loadDatabase = vi.fn();
    const repository = createContactsRepository(loadDatabase);

    await expect(repository.list(admin, {cursor: "not-a-cursor"})).rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("offers a next cursor only when another row exists", async () => {
    const one = fakeDatabase([[contactRow({total_count: 1})]]);
    const repository = createContactsRepository(async () => one.database as never);
    expect((await repository.list(admin, {limit: 1})).nextCursor).toBeNull();

    const two = fakeDatabase([[
      contactRow({total_count: 2}),
      contactRow({id: "22222222-2222-4222-8222-222222222222", total_count: 2}),
    ]]);
    const paged = createContactsRepository(async () => two.database as never);
    const page = await paged.list(admin, {limit: 1});
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });

  it("reads one contact and answers null for an id no row carries", async () => {
    const fake = fakeDatabase([[]]);
    const repository = createContactsRepository(async () => fake.database as never);

    expect(await repository.get(admin, contactId)).toBeNull();
  });
});

describe("contactsRepository.updatePipeline", () => {
  it("writes the stage change and contact.pipeline_updated in one transaction", async () => {
    const fake = fakeDatabase([
      [{id: contactId, stage: "new", owner_profile_id: null, tags: []}],
      [],
      [],
      [contactRow({stage: "contacted"})],
    ]);
    const repository = createContactsRepository(async () => fake.database as never);

    const row = await repository.updatePipeline(admin, contactId, {stage: "contacted"});

    expect(row.stage).toBe("contacted");
    expect(fake.outer).toEqual([]);
    expect(fake.transactions).toHaveLength(1);
    const statements = fake.transactions[0]!;
    expect(statements.some((statement) => /update "contacts"/i.test(statement.text))).toBe(true);
    const audit = statements.find((statement) => /insert into "audit_events"/i.test(statement.text));
    expect(audit).toBeDefined();
    expect(audit?.text).toContain("contact.pipeline_updated");
    expect(audit?.params).toContain(JSON.stringify({stage: "contacted"}));
  });

  it("records only the fields that actually changed", async () => {
    const fake = fakeDatabase([
      [{id: contactId, stage: "contacted", owner_profile_id: "staff-b", tags: ["vip"]}],
      [],
      [],
      [contactRow({stage: "contacted", owner_profile_id: "staff-a"})],
    ]);
    const repository = createContactsRepository(async () => fake.database as never);

    await repository.updatePipeline(admin, contactId, {
      stage: "contacted",
      ownerProfileId: "staff-a",
      tags: ["vip"],
    });

    const statements = fake.transactions[0]!;
    const audit = statements.find((statement) => /insert into "audit_events"/i.test(statement.text));
    // The stage and the tags are resubmitted unchanged by a form that carries
    // every field; a trail that records them as changes says everything, which
    // is the same as saying nothing.
    expect(audit?.params).toContain(JSON.stringify({ownerProfileId: "staff-a"}));
    expect(statements.filter((statement) => /update "contacts"/i.test(statement.text))).toHaveLength(1);
  });

  it("writes neither an update nor an audit row when nothing changed", async () => {
    const fake = fakeDatabase([
      [{id: contactId, stage: "contacted", owner_profile_id: null, tags: []}],
      [contactRow({stage: "contacted"})],
    ]);
    const repository = createContactsRepository(async () => fake.database as never);

    await repository.updatePipeline(admin, contactId, {stage: "contacted"});

    const statements = fake.transactions[0]!;
    expect(statements.some((statement) => /update "contacts"/i.test(statement.text))).toBe(false);
    expect(statements.some((statement) => /insert into "audit_events"/i.test(statement.text))).toBe(false);
  });

  it("refuses a tag list longer than the column is meant to carry, before the database loads", async () => {
    const loadDatabase = vi.fn();
    const repository = createContactsRepository(loadDatabase);

    await expect(repository.updatePipeline(admin, contactId, {
      tags: Array.from({length: 21}, (_value, index) => `tag-${index}`),
    })).rejects.toThrow(ZodError);
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});

describe("the /admin/contacts action boundary", () => {
  it("distinguishes an absent field from an emptied one", () => {
    const stageOnly = new FormData();
    stageOnly.set("stage", "contacted");
    // A row renders one form per concern; the stage control must not unassign
    // the owner just because it did not submit an owner field.
    expect(contactPipelineInput(stageOnly)).toEqual({stage: "contacted"});

    const unassign = new FormData();
    unassign.set("ownerProfileId", "");
    expect(contactPipelineInput(unassign)).toEqual({ownerProfileId: null});
  });

  it("allows only this page's own path back, in either locale", () => {
    expect(contactReturnPath("/admin/contacts?stage=new&saved=1")).toBe("/admin/contacts?stage=new&saved=1");
    // `zh-HK` is served at `/zh`, so both spellings of the pipeline are real
    // browser paths and both must survive the allowlist.
    expect(contactReturnPath("/zh/admin/contacts?saved=1")).toBe("/zh/admin/contacts?saved=1");
    expect(contactReturnPath("/admin/contacts?q=ada*&saved=1")).toBe("/admin/contacts?q=ada*&saved=1");
  });

  it("refuses anything that could send a saving admin off this site", () => {
    for (const hostile of [
      "https://example.com/admin/contacts",
      "//example.com/admin/contacts",
      "/admin/contacts/../../etc",
      "/admin/members?saved=1",
      "javascript:alert(1)",
      "/admin/contacts?saved=1\n/admin/members",
      "",
      null,
      42,
    ]) {
      expect(contactReturnPath(hostile), String(hostile)).toBeNull();
    }
  });
});
