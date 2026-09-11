import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {notificationActor} from "@/lib/db/repos/deliveries";
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
    // `kind` and `renewalAt` joined the projection in Phase C2 Task 8: the
    // campaign audience reads the same facts for a whole segment in one
    // statement, so the row has to say which arm it came from and carry the
    // membership date a renewal template interpolates.
    kind: "member",
    id: profileId,
    displayName: "Ada Chan",
    email: "ada@example.hk",
    whatsappNumber: "+85290000001",
    locale: "en",
    membershipStatus: "active",
    planCode: "community",
    renewalAt: null,
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
    kind: "contact",
    id: contactId,
    displayName: null,
    email: null,
    whatsappNumber: phone,
    locale: "zh-HK",
    membershipStatus: null,
    planCode: null,
    renewalAt: null,
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

  /**
   * The Phase C2 Task 10 review's finding, on the door that decides.
   *
   * Two `profiles` rows carry the same WhatsApp digits (a shared company
   * handset), so the webhook's `resolveProfile` answers null
   * (`if (matches.length !== 1) return null`) and `recordOptOut` writes only
   * `contactsRepository.markWhatsAppOptedOut(phoneE164)` — no
   * `message_suppressions` row, and `profiles.whatsapp_opt_in` still true. A
   * member arm that tested the flag alone answered `eligible`, and the blast
   * reached somebody who had said STOP.
   */
  it("blocks both purposes when the STOP landed on the member's linked contact row", async () => {
    const database = factsDatabase({
      member: memberRow({whatsappOptIn: true, whatsappSuppressed: false, whatsappOptedOutAt: new Date("2026-09-05T00:00:00Z")}),
    });
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
   * The other half of the same fix: the member ANCHOR has to read the column at
   * all. It hard-coded `NULL::timestamptz AS whatsapp_opted_out_at` until the
   * Phase C2 Task 10 review, so `whatsappOptedOutAt` could only ever be the
   * PROFILE-side derivation for a member — and a STOP that resolved no profile
   * writes nothing on that side. The consequence was an asymmetry in the wrong
   * direction: `campaignAudience` joins `contacts` through its member arm for
   * exactly this hazard, so the SNAPSHOT a second admin approves was stricter
   * than the send-time RECHECK that exists to backstop it.
   *
   * `contacts_profile_unique` is a partial UNIQUE index on `profile_id`
   * (`schema-core.ts`), so the join is at most one row and the anchor cannot
   * fan out into two facts rows for one member.
   */
  it("reads the linked contact's withdrawal from the member anchor", async () => {
    const database = factsDatabase({member: memberRow(), contact: contactRow()});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await repository.whatsAppEligibility(admin, input({profileId}));

    const memberSide = database.statements.find((statement) => !statement.sql.toLowerCase().includes(`from "contacts"`));
    const text = flatten(memberSide?.sql);
    expect(text).toContain(`from "profiles" left join "contacts" on "contacts"."profile_id" = "profiles"."id"`);
    expect(text).toContain(`"contacts"."whatsapp_opted_out_at" as whatsapp_opted_out_at`);
    expect(text).not.toContain("null::timestamptz");
  });

  /**
   * Postgres's grammar is `EXISTS select_with_parens`; a bare `EXISTS SELECT …`
   * is a syntax error, so a hand-written sub-select that forgets its parentheses
   * authorizes nothing and throws at the database instead of answering. The same
   * hazard `tests/unit/repository-exists-scope-sql.test.ts` pins for the
   * member-scoped repositories.
   *
   * It reads the statements through `stripped`, not raw, because an SQL comment
   * is not SQL. The member anchor's `--` prose explains the withdrawal join in
   * English, and the first English sentence to use the word "exists" — or to
   * put a bracketed aside in a comment — failed this pin while the generated
   * SQL was perfectly well formed. `flatten`'s docblock already records the
   * same hazard from the other direction.
   */
  it("parenthesises every hand-written EXISTS sub-select", async () => {
    const database = factsDatabase({member: memberRow(), contact: contactRow()});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await repository.whatsAppEligibility(admin, input({profileId}));

    const stripped = database.statements.map((statement) => statement.sql.replace(/--[^\n]*/g, " "));
    const text = stripped.join("\n");
    expect(text).toMatch(/\bexists\b/i);
    for (const [, following] of text.matchAll(/\bexists\b\s*(.)/gi)) expect(following).toBe("(");
    for (const statement of stripped) {
      expect(statement.split("(").length).toBe(statement.split(")").length);
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

/**
 * The DISPATCHER's door (C2 Task 3), onto the same private facts loader.
 *
 * Two doors on one module, deliberately, and the pair of refusals below is the
 * whole point of having two: `requireAdmin` needs a `profileId` no capability
 * actor has, and `requireDeliveryActor` is a capability check over a
 * `unique symbol` no session actor can mint. Widening either to cover the other
 * would make it forgeable from whichever side is weaker — a `"use server"`
 * boundary can put `{kind: "notification", source: "campaign"}` in a request
 * body and cannot put a symbol there.
 *
 * `factsFor` returns FACTS and not a verdict because its callers ask different
 * questions of them: Task 8's classifier folds them into an eligibility
 * category for a blast preview, the dispatcher picks a channel. One loader is
 * what keeps the preview and the send from disagreeing about one person.
 */
describe("factsFor (the dispatcher's door)", () => {
  it.each<[string, unknown]>([
    ["member", member],
    ["admin", admin],
    ["anonymous", ANONYMOUS_ACTOR],
  ])("refuses a %s actor before the database is opened", async (_name, actor) => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    await expect(repository.factsFor(actor as never, {kind: "member", profileId}))
      .rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("refuses a forged notification actor that lacks the capability symbol", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    await expect(repository.factsFor(
      {kind: "notification", userId: null, source: "campaign"} as never,
      {kind: "member", profileId},
    )).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("keeps the two doors apart: neither gate admits the other's actor", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);

    await expect(repository.whatsAppEligibility(notificationActor("campaign") as never, input()))
      .rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repository.factsFor(admin as never, {kind: "member", profileId}))
      .rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("admits the dispatcher capability and the automation cron", async () => {
    const database = factsDatabase({member: memberRow()});
    const repository = createMessageEligibilityRepository(async () => database.database);

    for (const actor of [notificationActor("campaign"), automationCronActor(), system]) {
      await expect(repository.factsFor(actor as never, {kind: "member", profileId}))
        .resolves.toMatchObject({kind: "member", id: profileId});
    }
  });

  it("parses the recipient before the database is opened", async () => {
    const loadDatabase = vi.fn();
    const repository = createMessageEligibilityRepository(loadDatabase as never);
    const actor = notificationActor("campaign");

    await expect(repository.factsFor(actor, {kind: "contact", contactId: "not-a-uuid"})).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.factsFor(actor, {kind: "prospect", id: contactId})).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.factsFor(actor, {kind: "member", profileId, contactId})).rejects.toBeInstanceOf(z.ZodError);
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  /**
   * The resurrection case. `suppressionsRepository.optOutWhatsApp` clears
   * `profiles.whatsapp_opt_in` and writes the `channel='whatsapp'` suppression
   * together, but the portal profile form can grant the flag back and nothing
   * deletes the suppression row — so a check that read the flag alone would call
   * this member sendable again. The suppression is reported as its own fact.
   */
  it("reports a member's whatsapp suppression even when the opt-in flag is back on", async () => {
    const database = factsDatabase({member: memberRow({whatsappOptIn: true, whatsappSuppressed: true})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.factsFor(notificationActor("campaign"), {kind: "member", profileId}))
      .resolves.toMatchObject({kind: "member", whatsappOptIn: true, whatsappSuppressed: true});
  });

  /**
   * The two facts stay SEPARATE in `RecipientFacts`. A prospect's STOP is
   * `contacts.whatsapp_opted_out_at`; `message_suppressions.profile_id` is NOT
   * NULL, so an unlinked contact can never have a row there at all. Folding them
   * into one flag here is what would make the inbox call somebody OPTED_OUT
   * while the campaign preview called them SUPPRESSED — Task 8's classifier is
   * where a marketing send folds them, once.
   */
  it("keeps a contact's withdrawal and a marketing suppression as two facts", async () => {
    const optedOutAt = new Date("2026-09-01T00:00:00.000Z");
    const database = factsDatabase({contact: contactRow({whatsappOptedOutAt: optedOutAt})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    const facts = await repository.factsFor(notificationActor("campaign"), {kind: "contact", contactId});
    expect(facts).toMatchObject({kind: "contact", id: contactId, whatsappSuppressed: false});
    expect(facts?.whatsappOptedOutAt).toEqual(optedOutAt);
  });

  it("reads one side per call, through the same loader the staff door uses", async () => {
    const database = factsDatabase({contact: contactRow()});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await repository.factsFor(notificationActor("campaign"), {kind: "contact", contactId});

    expect(database.statements).toHaveLength(1);
    const text = flatten(database.statements[0]?.sql);
    expect(text).toContain(`from "contacts"`);
    expect(text).toContain(`"message_suppressions"`);
    // `campaignAudience`'s `suppressed` flag reads `email_log.status='suppressed'`,
    // a value nothing in this repository ever writes. Do not reuse it.
    expect(text).not.toContain(`"email_log"`);
  });

  /**
   * The field the Task 10 review found missing on this door. `classifyRecipient`
   * folds `whatsappOptedOutAt` into `suppressed` and the send-queue runner
   * writes that verbatim to `blocked_reason`, so a member anchor that could not
   * produce the timestamp was the send-time recheck failing OPEN for the member
   * half of every audience.
   */
  it("reports a withdrawal recorded only on a member's linked contact row", async () => {
    const optedOutAt = new Date("2026-09-05T00:00:00.000Z");
    const database = factsDatabase({member: memberRow({whatsappOptIn: true, whatsappOptedOutAt: optedOutAt})});
    const repository = createMessageEligibilityRepository(async () => database.database);

    const facts = await repository.factsFor(notificationActor("campaign"), {kind: "member", profileId});
    expect(facts).toMatchObject({kind: "member", whatsappOptIn: true, whatsappSuppressed: false});
    expect(facts?.whatsappOptedOutAt).toEqual(optedOutAt);
  });

  it("answers null for a recipient that no longer exists", async () => {
    const database = factsDatabase({contact: null});
    const repository = createMessageEligibilityRepository(async () => database.database);

    await expect(repository.factsFor(notificationActor("campaign"), {kind: "contact", contactId})).resolves.toBeNull();
  });
});
