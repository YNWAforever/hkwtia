import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {
  createWhatsAppTemplatesRepository,
  templateRegistryActor,
  type WhatsAppTemplateRegistryReader,
} from "@/lib/db/repos/whatsapp-templates";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
import {approvedTemplateKeys} from "@/lib/whatsapp/approved-templates";

/**
 * Phase C2 Task 2 (C-7). "Approved" stops being an environment variable and
 * becomes a row a named admin approved on a date — and the gate that reads it
 * has to fail CLOSED, because the alternative is an unapproved element name
 * reaching Meta, a provider 4xx, and a permanent failure plus a staff task for
 * every recipient of a blast (S-14, O-7).
 *
 * The mock-mode branch is asserted first and hardest: every non-live test in
 * this suite depends on `approvedTemplateKeys` returning the whole config set
 * without opening a database, and a registry read that leaked into that branch
 * would turn every WhatsApp unit test into an integration test.
 */

const dialect = new PgDialect();

/** `NodeJS.ProcessEnv` requires `NODE_ENV`, so build one rather than cast one. */
function environment(values: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  return {NODE_ENV: "test", ...values};
}

function registry(
  answer: () => Promise<Readonly<{keys: ReadonlySet<WhatsAppTemplateKey>; empty: boolean}>>,
): {reader: WhatsAppTemplateRegistryReader; approved: ReturnType<typeof vi.fn>} {
  const approved = vi.fn(answer);
  return {reader: {approved} as unknown as WhatsAppTemplateRegistryReader, approved};
}

type Row = Record<string, unknown>;

function templateRow(overrides: Row = {}): Row {
  return {
    key: "renewal_14",
    element_name: "wtia_renewal_d14",
    language_code: "en_US",
    category: "utility",
    variables: ["memberName", "renewalDate", "renewalUrl"],
    previews: {},
    status: "pending",
    approved_at: null,
    reviewed_by_profile_id: null,
    rejection_reason: null,
    ...overrides,
  };
}

/**
 * A database that records the SQL it was handed, keeping statements issued
 * inside `transaction` separate from statements issued outside one. The audit
 * assertion below is only meaningful if the two are distinguishable: an audit
 * row written next to the decision but outside its transaction is exactly the
 * defect boundary 11 exists to prevent.
 */
function fakeDatabase(rows: readonly Row[] = [templateRow()]) {
  const outer: string[] = [];
  const transactions: string[][] = [];
  const render = (query: unknown) =>
    dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
  const database = {
    async execute(query: unknown) {
      outer.push(render(query));
      return {rows};
    },
    async transaction<T>(work: (transaction: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>): Promise<T> {
      const statements: string[] = [];
      transactions.push(statements);
      return work({
        async execute(query: unknown) {
          statements.push(render(query));
          return {rows};
        },
      });
    },
  };
  return {database, outer, transactions};
}

const admin = {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"} as const;
const member = {kind: "member", userId: "user-a", profileId: "user-a"} as const;

describe("approvedTemplateKeys (C-7 registry source)", () => {
  it("offers every configured key off the live switch, without asking the registry", async () => {
    const source = registry(async () => ({keys: new Set<WhatsAppTemplateKey>(), empty: false}));

    const keys = await approvedTemplateKeys(source.reader, environment());

    expect([...keys].sort()).toEqual(Object.keys(WHATSAPP_TEMPLATES).sort());
    // The branch every non-live test in the suite stands on: no database, no
    // await on a row, nothing to be approved against because the mock adapter
    // answers with a `mock:` provider id and nothing leaves the building (D-4).
    expect(source.approved).not.toHaveBeenCalled();
  });

  it("returns exactly the approved rows when the registry has been reviewed", async () => {
    const source = registry(async () => ({
      keys: new Set<WhatsAppTemplateKey>(["renewal_14"]),
      empty: false,
    }));

    const keys = await approvedTemplateKeys(source.reader, environment({RUN_LIVE_WOZTELL: "1"}));

    expect([...keys]).toEqual(["renewal_14"]);
    expect(source.approved).toHaveBeenCalledOnce();
    expect(source.approved.mock.calls[0]?.[0]).toMatchObject({kind: "template-registry"});
  });

  it("falls back to the operator allowlist only while the registry is empty", async () => {
    const source = registry(async () => ({keys: new Set<WhatsAppTemplateKey>(), empty: true}));

    const keys = await approvedTemplateKeys(source.reader, environment({
      RUN_LIVE_WOZTELL: "1",
      // The trailing spaces and the unknown key are the point: an operator types
      // this into a Vercel environment variable by hand.
      WOZTELL_APPROVED_TEMPLATE_KEYS: "renewal_14, concierge_follow_up_en ,not_a_template",
    }));

    expect([...keys].sort()).toEqual(["concierge_follow_up_en", "renewal_14"]);
  });

  it("refuses everything when the registry is empty and nothing is listed", async () => {
    const source = registry(async () => ({keys: new Set<WhatsAppTemplateKey>(), empty: true}));

    expect([...await approvedTemplateKeys(source.reader, environment({RUN_LIVE_WOZTELL: "1"}))])
      .toEqual([]);
  });

  it("drops a registry key the code cannot send", async () => {
    const source = registry(async () => ({
      // `whatsapp_templates` is reference data an operator can edit; the
      // config's `as const` is what types every send call site, so a row naming
      // a key no call site can produce must never widen the gate.
      keys: new Set(["renewal_14", "retired_template"]) as unknown as ReadonlySet<WhatsAppTemplateKey>,
      empty: false,
    }));

    const keys = await approvedTemplateKeys(source.reader, environment({RUN_LIVE_WOZTELL: "1"}));

    expect([...keys]).toEqual(["renewal_14"]);
  });

  it("fails closed when the registry read throws", async () => {
    const source = registry(async () => {
      throw new Error("connection terminated");
    });

    const keys = await approvedTemplateKeys(source.reader, environment({
      RUN_LIVE_WOZTELL: "1",
      // Deliberately present: a database outage must not silently promote the
      // environment variable back into the gate it replaced.
      WOZTELL_APPROVED_TEMPLATE_KEYS: "renewal_14",
    }));

    expect([...keys]).toEqual([]);
  });
});

describe("whatsappTemplatesRepository", () => {
  it.each([
    ["member", member],
    ["admin", admin],
    ["anonymous", ANONYMOUS_ACTOR],
    ["hand-rolled registry shape", {kind: "template-registry", userId: null}],
  ] as const)("refuses a %s actor on approved() before database access", async (_name, forged) => {
    const loadDatabase = vi.fn();
    const repository = createWhatsAppTemplatesRepository(loadDatabase);

    await expect(repository.approved(forged as never)).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["member", member],
    ["anonymous", ANONYMOUS_ACTOR],
    ["registry capability", templateRegistryActor()],
  ] as const)("refuses a %s actor on every admin write before database access", async (_name, forged) => {
    const loadDatabase = vi.fn();
    const repository = createWhatsAppTemplatesRepository(loadDatabase);

    await expect(repository.list(forged as never)).rejects.toThrow("FORBIDDEN");
    await expect(repository.setStatus(forged as never, "renewal_14", "approved", null))
      .rejects.toThrow("FORBIDDEN");
    await expect(repository.updatePreviews(forged as never, "renewal_14", {en: "Hi"}))
      .rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("refuses a template key the code cannot send, before opening the database", async () => {
    const loadDatabase = vi.fn();
    const repository = createWhatsAppTemplatesRepository(loadDatabase);

    await expect(repository.setStatus(admin, "retired_template", "approved", null))
      .rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("writes the status change and its audit row in one transaction", async () => {
    const fake = fakeDatabase([templateRow({
      status: "approved",
      approved_at: new Date("2026-09-11T04:00:00.000Z"),
      reviewed_by_profile_id: "staff-a",
    })]);
    const repository = createWhatsAppTemplatesRepository(async () => fake.database as never);

    const record = await repository.setStatus(admin, "renewal_14", "approved", null);

    expect(record.status).toBe("approved");
    expect(fake.outer).toEqual([]);
    expect(fake.transactions).toHaveLength(1);
    const statements = fake.transactions[0]!;
    expect(statements.some((statement) => /update "whatsapp_templates"/i.test(statement))).toBe(true);
    const audit = statements.find((statement) => /insert into "audit_events"/i.test(statement));
    expect(audit).toBeDefined();
    expect(statements.join(" ")).toContain("whatsapp_template.status_changed");
  });

  it("clears the approval date when a template is taken back out of service", async () => {
    const fake = fakeDatabase([templateRow({status: "disabled"})]);
    const repository = createWhatsAppTemplatesRepository(async () => fake.database as never);

    await repository.setStatus(admin, "renewal_14", "disabled", "Meta paused the template");

    // `whatsapp_templates_approved_at_check` only forbids an approval WITHOUT a
    // date; leaving a stale date on a disabled row would make the registry read
    // as "approved on 3 September" for something nobody may send.
    expect(fake.transactions[0]!.join(" ")).toMatch(/approved_at\s*=\s*NULL/i);
  });

  it("audits a preview edit under its own action", async () => {
    const fake = fakeDatabase();
    const repository = createWhatsAppTemplatesRepository(async () => fake.database as never);

    await repository.updatePreviews(admin, "renewal_14", {en: "Hi {{1}}", "zh-HK": "你好 {{1}}"});

    expect(fake.transactions).toHaveLength(1);
    expect(fake.transactions[0]!.join(" ")).toContain("whatsapp_template.previews_updated");
  });

  it("reports an empty registry as empty rather than as nothing approved", async () => {
    const fake = fakeDatabase([]);
    const repository = createWhatsAppTemplatesRepository(async () => fake.database as never);

    const result = await repository.approved(templateRegistryActor());

    // The two answers are different: "empty" hands the gate back to the operator
    // allowlist for one deploy, "nothing approved" sends nothing at all.
    expect(result).toEqual({keys: new Set(), empty: true});
  });

  it("intersects the approved rows with the config before returning them", async () => {
    const fake = fakeDatabase([
      templateRow({key: "renewal_14", status: "approved"}),
      templateRow({key: "dunning_3", status: "pending"}),
      templateRow({key: "retired_template", status: "approved"}),
    ]);
    const repository = createWhatsAppTemplatesRepository(async () => fake.database as never);

    const result = await repository.approved(templateRegistryActor());

    expect([...result.keys]).toEqual(["renewal_14"]);
    expect(result.empty).toBe(false);
  });
});
