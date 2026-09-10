import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {createMessageEligibilityRepository} from "@/lib/db/repos/message-eligibility";
import {woztellWebhookActor} from "@/lib/db/repos/woztell-inbound-events";
import {ANONYMOUS_ACTOR, type Actor} from "@/lib/membership/lifecycle";

const dialect = new PgDialect();

const admin = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;
const member = {kind: "member", userId: "auth-member", profileId: "member-1"} as const;
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;

const profileId = "member-1";
const contactId = "11111111-1111-4111-8111-111111111111";
const phone = "+85291234567";

type FactRow = Readonly<Record<string, unknown>>;

/**
 * The module runs one query per side, so the fake answers by anchor table: a
 * statement that selects `FROM "profiles"` is the member side, one that selects
 * `FROM "contacts"` is the contact side. Answering by call order instead would
 * make the "reads BOTH tables" assertions vacuous — the single worst failure
 * mode available here is reading only one of the two, because
 * `message_suppressions.profile_id` is NOT NULL so a contact can never be
 * suppressed there and `contacts.whatsapp_opted_out_at` is the only record of a
 * prospect's STOP.
 */
function factsDatabase(sides: Readonly<{member?: FactRow | null; contact?: FactRow | null}>) {
  const statements: {sql: string; params: readonly unknown[]}[] = [];
  const execute = vi.fn(async (query: never) => {
    const compiled = dialect.sqlToQuery(query);
    statements.push({sql: compiled.sql, params: compiled.params});
    const text = compiled.sql.toLowerCase();
    const anchor = text.includes(`from "contacts"`) ? "contact" : "member";
    const row = anchor === "contact" ? sides.contact : sides.member;
    return row ? [row] : [];
  });
  const database = {
    execute,
    async transaction<T>(work: (transaction: {execute: typeof execute}) => Promise<T>): Promise<T> {
      return work({execute});
    },
  };
  return {statements, execute, database: database as never};
}

function memberRow(overrides: FactRow = {}): FactRow {
  return {
    id: profileId,
    displayName: "Ada Chan",
    email: "ada@example.hk",
    whatsappNumber: "+85290000001",
    locale: "en",
    membershipStatus: "active",
    planCode: "community",
    marketingConsent: true,
    whatsappOptIn: true,
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    whatsappSuppressed: false,
    ...overrides,
  };
}

function contactRow(overrides: FactRow = {}): FactRow {
  return {
    id: contactId,
    displayName: null,
    email: null,
    whatsappNumber: phone,
    locale: "zh-HK",
    membershipStatus: null,
    planCode: null,
    marketingConsent: false,
    whatsappOptIn: false,
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    whatsappSuppressed: false,
    ...overrides,
  };
}

/**
 * `--` comments are house style inside these templates and they run to the end
 * of a LINE, so they have to be stripped before the newlines are collapsed —
 * otherwise the collapse splices a comment across the rest of the statement and
 * every assertion below reads the wrong text.
 */
function flatten(statement: string | undefined): string {
  return (statement ?? "").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function input(overrides: Readonly<Record<string, unknown>> = {}) {
  return {profileId: null, contactId, phoneE164: phone, purpose: "service", ...overrides};
}

describe("message eligibility authorization (S-9)", () => {
  it.each<[string, Actor]>([
    ["member", member],
    ["anonymous", ANONYMOUS_ACTOR],
    ["system", system],
  ])("refuses a %s actor before the database is opened", async (_name, actor) => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    await expect(repository.whatsAppEligibility(actor, input())).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("refuses a capability actor: requireAdmin is a session gate and cannot be widened", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    // The shape C2 Task 3's `factsFor` will take. It must not reach this door.
    await expect(repository.whatsAppEligibility(
      {kind: "notification", userId: null} as unknown as Actor,
      input(),
    )).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("parses the input before the database is opened", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    await expect(repository.whatsAppEligibility(admin, input({purpose: "promotional"}))).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.whatsAppEligibility(admin, input({phoneE164: "85291234567"}))).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.whatsAppEligibility(admin, input({contactId: "not-a-uuid"}))).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.whatsAppEligibility(admin, {...input(), extra: true})).rejects.toBeInstanceOf(z.ZodError);
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});

describe("whatsAppEligibility precedence", () => {
  it("blocks both purposes when a contact withdrew explicitly", async () => {
    const database = factsDatabase({contact: contactRow({whatsappOptIn: true, whatsappOptedOutAt: new Date("2026-09-01T00:00:00Z")})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibility(admin, input({purpose: "service"}))).resolves.toEqual({status: "blocked", reason: "opted_out"});
    await expect(repository.whatsAppEligibility(admin, input({purpose: "marketing"}))).resolves.toEqual({status: "blocked", reason: "opted_out"});
  });

  it("blocks both purposes when the member's WhatsApp flag is off", async () => {
    const database = factsDatabase({member: memberRow({whatsappOptIn: false})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    for (const purpose of ["service", "marketing"] as const) {
      await expect(repository.whatsAppEligibility(admin, input({profileId, contactId: null, purpose})))
        .resolves.toEqual({status: "blocked", reason: "opted_out"});
    }
  });

  it("lets a marketing suppression block marketing only", async () => {
    // A service reply inside the window is a direct answer to a message the
    // recipient sent us minutes ago; a marketing suppression does not gag us
    // from answering it.
    const database = factsDatabase({member: memberRow({whatsappSuppressed: true})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibility(admin, input({profileId, contactId: null, purpose: "service"})))
      .resolves.toEqual({status: "eligible", phoneE164: "+85290000001"});
    await expect(repository.whatsAppEligibility(admin, input({profileId, contactId: null, purpose: "marketing"})))
      .resolves.toEqual({status: "blocked", reason: "suppressed"});
  });

  /**
   * Rule 3, both ways, because a version without the purpose branch makes the
   * §6 gate impossible. `contacts.whatsapp_opt_in` is `.default(false).notNull()`
   * and `upsertFromWhatsApp` never sets it, so every prospect who messages the
   * WTIA number is `whatsapp_opt_in = false` forever. Gating a customer-service
   * reply on marketing opt-in would answer NOT_OPTED_IN for every prospect there
   * has ever been; the gate on a service reply is the 24-hour window.
   */
  it("gates marketing on the opt-in and leaves a service reply to the window", async () => {
    const database = factsDatabase({contact: contactRow({whatsappOptIn: false})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibility(admin, input({purpose: "service"})))
      .resolves.toEqual({status: "eligible", phoneE164: phone});
    await expect(repository.whatsAppEligibility(admin, input({purpose: "marketing"})))
      .resolves.toEqual({status: "blocked", reason: "not_opted_in"});
  });

  it("blocks both purposes when neither side carries a number", async () => {
    const database = factsDatabase({contact: contactRow({whatsappNumber: null, whatsappOptIn: true})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    for (const purpose of ["service", "marketing"] as const) {
      await expect(repository.whatsAppEligibility(admin, input({phoneE164: null, purpose})))
        .resolves.toEqual({status: "blocked", reason: "no_number"});
    }
  });

  it("refuses to send to a number the caller supplied but no row carries", async () => {
    // The pre-deploy anonymous threads: 0032 backfills the channel and the
    // window but nothing can backfill `conversations.contact_id`, so the thread
    // renders a live countdown and resolves to no recipient at all. Trusting the
    // caller's number here would send to somebody whose consent we never read.
    const database = factsDatabase({});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibility(admin, input({profileId: null, contactId: null})))
      .resolves.toEqual({status: "blocked", reason: "no_number"});
    expect(database.execute).not.toHaveBeenCalled();

    const missing = factsDatabase({contact: null});
    const missingRepository = createMessageEligibilityRepository(async () => missing.database);
    await expect(missingRepository.whatsAppEligibility(admin, input()))
      .resolves.toEqual({status: "blocked", reason: "no_number"});
  });

  it("prefers the contact's number, which is the one the message arrived from", async () => {
    const database = factsDatabase({
      member: memberRow({whatsappNumber: "+85290000001"}),
      contact: contactRow({whatsappNumber: phone, whatsappOptIn: true}),
    });
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibility(admin, input({profileId, purpose: "marketing"})))
      .resolves.toEqual({status: "eligible", phoneE164: phone});
  });

  it("ignores a stored number that is not E.164, rather than handing it to the adapter", async () => {
    const database = factsDatabase({member: memberRow({whatsappNumber: "9123 4567"})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibility(admin, input({profileId, contactId: null})))
      .resolves.toEqual({status: "blocked", reason: "no_number"});
  });

  it("reads both sides and both consent tables in the same answer", async () => {
    const database = factsDatabase({
      member: memberRow({whatsappOptIn: true}),
      contact: contactRow({whatsappOptedOutAt: new Date("2026-09-02T00:00:00Z")}),
    });
    const repository = createMessageEligibilityRepository(async () => database.database);

    // The member side alone would say `eligible`; the contact side is where the
    // STOP is recorded, and it wins.
    await expect(repository.whatsAppEligibility(admin, input({profileId})))
      .resolves.toEqual({status: "blocked", reason: "opted_out"});

    const text = database.statements.map((statement) => statement.sql.toLowerCase()).join("\n");
    expect(database.statements).toHaveLength(2);
    expect(text).toContain(`from "profiles"`);
    expect(text).toContain(`from "contacts"`);
    expect(text).toContain(`"message_suppressions"`);
    // `campaignAudience`'s `suppressed` flag reads `email_log.status='suppressed'`,
    // a value nothing in this repository ever writes. Do not reuse it.
    expect(text).not.toContain(`"email_log"`);
    expect(database.statements.some((statement) => statement.params.includes(profileId))).toBe(true);
    expect(database.statements.some((statement) => statement.params.includes(contactId))).toBe(true);
  });

  /**
   * The consent hole a review of Task 5 found, closed inside the module.
   *
   * A member who withdrew through `/api/unsubscribe?channel=whatsapp` gets the
   * profile leg only — `suppressionsRepository.optOutWhatsApp` never touches
   * their `contacts` row — so a caller that resolves a thread by `contactId`
   * alone (C2 Task 7 builds those) read `contacts.whatsapp_opted_out_at IS NULL`
   * and was answered `eligible` for a service reply to somebody who had told us
   * to stop.
   *
   * The derivation reads the EVIDENCE — the profile flag off AND a
   * `channel='whatsapp'` suppression, which that one method writes together and
   * nothing else writes at all — never the flag alone. The flag alone is
   * `.default(false).notNull()`, so it would answer `opted_out` for every
   * contact linked to a member who never opted in to marketing and would block
   * staff from replying in a member-owned §6 thread: rule 3's failure mode
   * wearing rule 1's clothes.
   */
  it("derives a linked member's recorded withdrawal, from the evidence and not the flag", async () => {
    const database = factsDatabase({member: memberRow(), contact: contactRow()});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await repository.whatsAppEligibility(admin, input({profileId}));

    const contactSide = database.statements.find((statement) => statement.sql.toLowerCase().includes(`from "contacts"`));
    const text = flatten(contactSide?.sql);
    expect(text).toContain(`coalesce(target.whatsapp_opted_out_at, ( select "message_suppressions"."created_at"`);
    expect(text).toContain(`"message_suppressions"."profile_id" = target.profile_id`);
    expect(text).toContain(`"message_suppressions"."channel" = 'whatsapp'`);
    expect(text).toContain(`"profiles"."whatsapp_opt_in" = false`);
    expect(text).toContain(`order by "message_suppressions"."created_at" asc limit 1`);
    // The contact's own marketing flag stays the contact's own: the derivation
    // answers the withdrawal question, never the opt-in one.
    expect(text).toContain(`"contacts"."whatsapp_opt_in" as whatsapp_opt_in`);
  });

  /**
   * Postgres's grammar is `EXISTS select_with_parens`; a bare `EXISTS SELECT …`
   * is a syntax error, so a hand-written sub-select that forgets its parentheses
   * authorizes nothing and throws at the database instead of answering. The same
   * hazard `tests/unit/repository-exists-scope-sql.test.ts` pins for the
   * member-scoped repositories.
   */
  it("parenthesises every hand-written EXISTS sub-select", async () => {
    const database = factsDatabase({member: memberRow(), contact: contactRow()});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await repository.whatsAppEligibility(admin, input({profileId}));

    const text = database.statements.map((statement) => statement.sql).join("\n");
    expect(text).toMatch(/\bexists\b/i);
    for (const [, following] of text.matchAll(/\bexists\b\s*(.)/gi)) expect(following).toBe("(");
    for (const statement of database.statements) {
      expect(statement.sql.split("(").length).toBe(statement.sql.split(")").length);
    }
  });
});

/**
 * The bot lane's door, added by the C-1 consent review.
 *
 * `lib/ai/woztell-webhook.ts` decided the bot's opt-in question from
 * `profile?.whatsappOptIn ?? true` — a sender with no profile was always
 * "opted in", and the lane never read `contacts.whatsapp_opted_out_at` at all,
 * so a prospect who said STOP was answered by the concierge the next time they
 * wrote. The fix is not a second consent reader: it is this door onto the SAME
 * private facts loader and the SAME precedence, so the answer the bot gets and
 * the answer staff get can never disagree.
 *
 * A separate door rather than a widened `requireAdmin`, for the reason the
 * module already states about its two existing gates: the webhook holds a
 * capability, not a session, and a gate that admitted both would be forgeable
 * from either side.
 */
describe("whatsAppEligibilityForWebhook (the bot lane's door)", () => {
  it("refuses every actor that is not the Woztell webhook capability", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    for (const forged of [admin, member, system, ANONYMOUS_ACTOR, {kind: "woztell-webhook", userId: null}, null]) {
      await expect(repository.whatsAppEligibilityForWebhook(forged, input())).rejects.toThrow("FORBIDDEN");
    }
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("parses the input before the database is opened", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    await expect(repository.whatsAppEligibilityForWebhook(woztellWebhookActor(), input({purpose: "promotional"})))
      .rejects.toBeInstanceOf(z.ZodError);
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("answers a prospect's recorded STOP with the same precedence the staff lane gets", async () => {
    const database = factsDatabase({contact: contactRow({whatsappOptedOutAt: new Date("2026-09-01T00:00:00Z")})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibilityForWebhook(woztellWebhookActor(), input({purpose: "service"})))
      .resolves.toEqual({status: "blocked", reason: "opted_out"});
  });

  /**
   * The population Phase C exists to serve. `contacts.whatsapp_opt_in` is false
   * for every prospect who has ever written in, so a door that answered
   * `not_opted_in` here would silence the concierge entirely.
   */
  it("lets the concierge answer a prospect who has not withdrawn", async () => {
    const database = factsDatabase({contact: contactRow({whatsappOptIn: false})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.whatsAppEligibilityForWebhook(woztellWebhookActor(), input({purpose: "service"})))
      .resolves.toEqual({status: "eligible", phoneE164: phone});
  });
});
