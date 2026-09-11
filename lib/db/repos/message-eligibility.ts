import "server-only";

import {sql} from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {requireDeliveryActor, type DeliveryActor} from "@/lib/db/repos/deliveries";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {requireWoztellWebhook} from "@/lib/db/repos/woztell-inbound-events";
import {companyMembers, contacts, memberships, messageSuppressions, profiles} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Phase C1 S-9. One module answers "may we send?", for two recipient kinds,
 * through two gates.
 *
 * Consent for a WhatsApp send lives in two places that do not know about each
 * other. `message_suppressions.profile_id` is NOT NULL, so a **contact** can
 * never be suppressed there; a contact's withdrawal is
 * `contacts.whatsapp_opted_out_at`. A check that reads one of the two produces a
 * send that reaches somebody who said STOP, and that is the single worst failure
 * mode available here. This reads both, for every answer.
 *
 * One other read looks like it would do and must not be reused:
 * `contacts.whatsapp_opt_in` alone is marketing consent, not the presence or
 * absence of a withdrawal. The second one used to be `campaignAudience`'s
 * `suppressed` flag (`lib/db/repos/campaigns.ts`), which tested
 * `email_log.status = 'suppressed'` — a value nothing in this repository has
 * ever written, so the flag was constant `false` from M2 until C2 Task 8
 * deleted it. That audience now reads `recipientFactsProjection` below, so
 * there is exactly one suppression reader left in the tree.
 *
 * **Ownership.** C1 Task 5 creates this file with the private facts loader, the
 * exported `RecipientFacts` type and the admin door. C2 Task 3 **modifies** it,
 * appending `factsFor(actor: NotificationActor | AutomationRepositoryActor, …)`
 * over the *same* private loader — it does not create a second module and it
 * does not re-declare `RecipientFacts`. Two doors, deliberately: an admin
 * replying in the inbox is a session principal, a dispatcher is a capability
 * principal with no `profileId` for `requireAdmin` to check, and neither gate
 * can be widened to cover the other without becoming forgeable.
 */

export type WhatsAppSendPurpose = "service" | "marketing";

export type EligibilityRecipient =
  | Readonly<{kind: "member"; profileId: string}>
  | Readonly<{kind: "contact"; contactId: string}>;

/**
 * The facts, from BOTH sides, in one shape. C2 Task 3's `factsFor` and C2 Task
 * 8's `classifyRecipient` consume this type; neither may re-declare it.
 *
 * `whatsappOptedOutAt` and `whatsappSuppressed` are kept SEPARATE on purpose.
 * An explicit STOP and a marketing suppression are different facts with
 * different consequences for a `service` send, and folding them here is what
 * would make the inbox and the campaign preview disagree about the same person.
 */
export type RecipientFacts = Readonly<{
  kind: "member" | "contact";
  id: string;
  displayName: string;
  email: string | null;
  whatsappNumber: string | null;
  locale: "en" | "zh-HK";
  membershipStatus: string | null;
  planCode: string | null;
  /**
   * The linked membership's billing period end. C2 Task 3 Step 3's standing
   * instruction — "if C1's loader does not yet project a field this plan needs,
   * widen the loader; do not add a second query" — applied by Task 8: the
   * `{{renewalDate}}` token a campaign resolves per recipient has to come from
   * the same row every other consent fact comes from, or a blast interpolates
   * one membership and blocks on another.
   */
  renewalAt: Date | null;
  marketingConsent: boolean;
  whatsappOptIn: boolean;
  whatsappOptedOutAt: Date | null;
  emailSuppressed: boolean;
  /** A `message_suppressions` row on channel 'whatsapp'. */
  whatsappSuppressed: boolean;
}>;

export type WhatsAppEligibilityBlockReason = "no_number" | "not_opted_in" | "opted_out" | "suppressed";

export type WhatsAppEligibility =
  | Readonly<{status: "eligible"; phoneE164: string}>
  | Readonly<{status: "blocked"; reason: WhatsAppEligibilityBlockReason}>;

/**
 * The pattern `contacts.phone_e164` is written through and the one the Woztell
 * adapter expects. `profiles.whatsapp_number` is free text, so a stored value
 * that does not match is treated as no number at all: handing "9123 4567" to
 * the adapter is a provider 4xx recorded as a permanent failure, and a blocked
 * send is the recoverable half of that pair.
 */
const E164 = /^\+\d{8,15}$/;

/**
 * C2 Task 3. `factsFor`'s boundary. A discriminated union rather than the
 * nullable pair `eligibilityInputSchema` takes, because this door answers about
 * ONE identity: a caller holding both ids asks twice and folds the answers
 * itself, which is what `answerWhatsApp` does above.
 */
const recipientSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("member"), profileId: z.string().min(1).max(255)}).strict(),
  z.object({kind: z.literal("contact"), contactId: z.string().uuid()}).strict(),
]);

const eligibilityInputSchema = z.object({
  profileId: z.string().min(1).max(255).nullable(),
  contactId: z.string().uuid().nullable(),
  phoneE164: z.string().regex(E164).nullable(),
  purpose: z.enum(["service", "marketing"]),
}).strict();

const factsRowSchema = z.object({
  kind: z.enum(["member", "contact"]),
  id: z.union([z.string(), z.number()]).transform((value) => String(value)),
  displayName: z.string().nullable().transform((value) => value ?? ""),
  email: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  locale: z.string().nullable().transform((value) => (value === "zh-HK" ? "zh-HK" as const : "en" as const)),
  membershipStatus: z.string().nullable(),
  planCode: z.string().nullable(),
  renewalAt: z.coerce.date().nullable(),
  marketingConsent: z.coerce.boolean(),
  whatsappOptIn: z.coerce.boolean(),
  whatsappOptedOutAt: z.coerce.date().nullable(),
  emailSuppressed: z.coerce.boolean(),
  whatsappSuppressed: z.coerce.boolean(),
});

/**
 * The one parse for a facts row, exported because C2 Task 8's audience query
 * reads the SAME projection for a whole segment at once. A second zod schema
 * over the same columns is how a set-based read and a single-row read start
 * disagreeing about a coercion — `whatsappSuppressed` arrives as a boolean from
 * the driver and as `'t'` from the proxy, and only one of two copies would ever
 * be fixed.
 */
export function parseRecipientFactsRow(row: unknown): RecipientFacts {
  return factsRowSchema.parse(row);
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

/**
 * Drizzle's `exists()` helper only parenthesises a `Subquery` object and pastes
 * a raw fragment in bare, and Postgres's grammar is `EXISTS select_with_parens`
 * — so the parentheses are written out here by hand, the way every other
 * repository in this tree spells them
 * (`tests/unit/repository-exists-scope-sql.test.ts` is the pin).
 *
 * The scope is `target.profile_id`, which for a contact is its optional profile
 * link. That is not an oversight: it is exactly how a contact can be suppressed
 * at all, given `message_suppressions.profile_id` is NOT NULL.
 *
 * S-9 rule 2 words this as a `classification='marketing'` suppression and this
 * does not filter on classification — a decision, not an omission. Today the
 * two are the same set: `suppressionsRepository` is the only writer of the
 * table and both of its INSERTs are `'marketing'`. If a stronger classification
 * is ever added, the unfiltered read over-blocks `marketing` (safe) where the
 * filtered one would let a blast through a suppression stronger than the one it
 * was checking for. Either way rule 2 leaves a `service` reply alone, so
 * neither spelling can gag an answer inside the customer-service window.
 */
function suppressionExists(channel: "email" | "whatsapp"): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${messageSuppressions}
    WHERE ${messageSuppressions.profileId} = target.profile_id
      AND ${messageSuppressions.channel} = ${channel}
  )`;
}

/**
 * A member's recorded WhatsApp withdrawal, as a timestamp, for a row that
 * carries no withdrawal column of its own.
 *
 * `profiles` has no `whatsapp_opted_out_at`. `suppressionsRepository
 * .optOutWhatsApp` records a member's STOP by clearing `whatsapp_opt_in` AND
 * inserting the `channel='whatsapp'` suppression in one transaction, and it is
 * the only writer of either — so the PAIR is evidence of an explicit
 * withdrawal where neither half is evidence alone. `profiles.whatsapp_opt_in`
 * is `.default(false).notNull()` (`schema-core.ts:151`), so a member who simply
 * never opted in has it false too; and the suppression on its own would outlive
 * a re-consent that turned the flag back on.
 *
 * This exists because of the hole a review found on the CONTACT side. A member
 * who withdrew through `/api/unsubscribe?channel=whatsapp` gets the profile leg
 * only — `suppressionsRepository` never touches their `contacts` row — so a
 * caller that resolves a thread by `contactId` alone (C2 Task 7 builds those
 * call sites; none exists yet) read `contacts.whatsapp_opted_out_at IS NULL`
 * and was answered `eligible` for a service reply to somebody who had told us
 * to stop. Closing that here, rather than trusting every future caller to pass
 * both ids, is what this module is for.
 *
 * The obvious closure is the trap and not the fix: reading the linked profile's
 * `whatsapp_opt_in` the way rule 1's member arm does would answer `opted_out`
 * for every contact linked to a member who never opted in to marketing, and a
 * staff reply into a member-owned §6 thread would be blocked — rule 3's failure
 * mode, wearing rule 1's clothes. Reading the evidence has no false positives.
 *
 * Read the DATE as "withdrew at least once, at or before this", never as "the
 * latest withdrawal". `optOutWhatsApp`'s suppression INSERT is
 * `ON CONFLICT DO NOTHING` and nothing re-stamps `created_at`, so after a
 * re-consent (the portal profile form grants `whatsapp_opt_in` back today) and
 * a second withdrawal this still reports the FIRST one; the contact side's
 * `COALESCE(whatsapp_opted_out_at, now())` freezes the same way, deliberately.
 * `decideWhatsApp` only ever tests null / non-null, so no send decision moves —
 * but **C2 Task 8's thread UI is the named consumer of this field** and is the
 * first code that would print it as a date.
 */
function linkedMemberWithdrawalAt(): SQL {
  return sql`(
    SELECT ${messageSuppressions.createdAt}
    FROM ${messageSuppressions}
    JOIN ${profiles} ON ${profiles.id} = ${messageSuppressions.profileId}
    WHERE ${messageSuppressions.profileId} = target.profile_id
      AND ${messageSuppressions.channel} = 'whatsapp'
      AND ${profiles.whatsappOptIn} = false
    ORDER BY ${messageSuppressions.createdAt} ASC
    LIMIT 1
  )`;
}

/**
 * The one projection. `targets` is any statement yielding the anchor columns
 * (`kind`, `id`, `profile_id`, `display_name`, `email`, `whatsapp_number`,
 * `locale`, `marketing_consent`, `whatsapp_opt_in`, `whatsapp_opted_out_at`);
 * everything derived — the membership, the withdrawal, both suppressions — is
 * computed here and nowhere else.
 *
 * Exported for C2 Task 8, whose campaign audience needs the same facts for a
 * whole segment in one statement. It is a projection over a set rather than a
 * second query precisely because the alternative was a copy: the eligibility
 * preview a human approves and the send that follows must be able to disagree
 * about nobody, and two hand-written `EXISTS` sub-selects over
 * `message_suppressions` would have drifted the first time one of them was
 * fixed. `campaignAudience`'s predecessor is the cautionary case — it read
 * `email_log.status = 'suppressed'`, a value no writer in the tree ever wrote,
 * so its suppression column had been constant `false` since M2.
 *
 * `marketingConsent` for a contact is `false` rather than its WhatsApp flag: a
 * contact carries no marketing-consent column of its own, the interest form
 * only ever asked about WhatsApp, and inferring an email opt-in from a WhatsApp
 * one is the kind of quiet widening this module exists to refuse. The WhatsApp
 * answer is reported where it belongs, in `whatsappOptIn`.
 *
 * The membership LATERAL picks the most recently created membership, which is
 * the row a renewal or dunning message is about. The audience query this
 * replaced picked the EARLIEST `billing_period_end`; for a member holding one
 * membership — every member in the tree today — they are the same row.
 *
 * It reaches a COMPANY seat as well as an owner-held membership, and that arm
 * is load-bearing rather than tidy. `memberships.owner_user_id` is NULL for
 * every corporate row (the M2 fixture's first twelve are all company-held), so
 * an owner-only join reports `membershipStatus: null` for most of the
 * membership — and C2 Task 8 turns a null status into `plan_ineligible`, which
 * would silently exclude every corporate member from every campaign while the
 * preview cheerfully named a reason. The audience query this projection
 * replaced joined both ways; losing that on the way in would have been the
 * expensive kind of invisible.
 */
export function recipientFactsProjection(targets: SQL): SQL {
  return sql`
    WITH target AS (${targets})
    SELECT
      target.kind AS "kind",
      target.id AS "id",
      target.display_name AS "displayName",
      target.email AS "email",
      target.whatsapp_number AS "whatsappNumber",
      target.locale AS "locale",
      membership.status AS "membershipStatus",
      membership.plan_code AS "planCode",
      membership.renewal_at AS "renewalAt",
      target.marketing_consent AS "marketingConsent",
      target.whatsapp_opt_in AS "whatsappOptIn",
      -- Both sides of the withdrawal fact in one column: the row's own
      -- timestamp (contacts), or the linked member's recorded withdrawal.
      COALESCE(target.whatsapp_opted_out_at, ${linkedMemberWithdrawalAt()}) AS "whatsappOptedOutAt",
      ${suppressionExists("email")} AS "emailSuppressed",
      ${suppressionExists("whatsapp")} AS "whatsappSuppressed"
    FROM target
    LEFT JOIN LATERAL (
      SELECT ${memberships.status} AS status, ${memberships.planCode} AS plan_code, ${memberships.billingPeriodEnd} AS renewal_at
      FROM ${memberships}
      WHERE ${memberships.ownerUserId} = target.profile_id
        OR ${memberships.companyId} IN (
          SELECT ${companyMembers.companyId} FROM ${companyMembers}
          WHERE ${companyMembers.userId} = target.profile_id AND ${companyMembers.revokedAt} IS NULL
        )
      ORDER BY ${memberships.createdAt} DESC
      LIMIT 1
    ) AS membership ON true
  `;
}

/**
 * PRIVATE. The one query. C2 Task 3's `factsFor` calls this, not a second one.
 *
 * One anchor per side, chosen by recipient kind, handed to the shared
 * projection above.
 */
async function loadRecipientFacts(
  database: AutomationDatabase,
  recipient: EligibilityRecipient,
): Promise<RecipientFacts | null> {
  const anchor = recipient.kind === "member"
    ? sql`
        SELECT
          'member'::text AS kind,
          ${profiles.id} AS id,
          ${profiles.id} AS profile_id,
          ${profiles.displayName} AS display_name,
          ${profiles.email} AS email,
          ${profiles.whatsappNumber} AS whatsapp_number,
          ${profiles.locale} AS locale,
          ${profiles.consentMarketing} AS marketing_consent,
          ${profiles.whatsappOptIn} AS whatsapp_opt_in,
          -- profiles has no withdrawal column of its own; the projection
          -- derives one from the recorded withdrawal (linkedMemberWithdrawalAt).
          NULL::timestamptz AS whatsapp_opted_out_at
        FROM ${profiles}
        WHERE ${profiles.id} = ${recipient.profileId}
      `
    : sql`
        SELECT
          'contact'::text AS kind,
          ${contacts.id}::text AS id,
          ${contacts.profileId} AS profile_id,
          ${contacts.displayName} AS display_name,
          ${contacts.email} AS email,
          ${contacts.phoneE164} AS whatsapp_number,
          ${contacts.locale} AS locale,
          false AS marketing_consent,
          ${contacts.whatsappOptIn} AS whatsapp_opt_in,
          ${contacts.whatsappOptedOutAt} AS whatsapp_opted_out_at
        FROM ${contacts}
        WHERE ${contacts.id} = ${recipient.contactId}
      `;

  const row = rowsFrom(await database.execute(recipientFactsProjection(anchor)))[0];
  return row ? parseRecipientFactsRow(row) : null;
}

function sendableNumber(facts: RecipientFacts | null): string | null {
  const number = facts?.whatsappNumber ?? null;
  return number !== null && E164.test(number) ? number : null;
}

/**
 * The precedence, and it is not negotiable (S-9).
 *
 *   1. an explicit withdrawal blocks BOTH purposes;
 *   2. a marketing suppression blocks `marketing` only — a service reply inside
 *      the window is a direct answer to a message the recipient sent us minutes
 *      ago, and a marketing suppression does not gag us from answering it;
 *   3. marketing opt-in gates `marketing` only. This one is load-bearing:
 *      `contacts.whatsapp_opt_in` is `.default(false).notNull()` and
 *      `upsertFromWhatsApp` never sets it, so every prospect who messages the
 *      WTIA number is `whatsapp_opt_in = false` forever. A rule 3 without the
 *      purpose branch answers `not_opted_in` for every prospect there has ever
 *      been, and the §6 gate — a prospect writes in, staff take the thread over
 *      and reply inside the window — could not pass for anyone. The gate on a
 *      service reply is the 24-hour customer-service window, enforced twice
 *      (the action's own window check and the adapter's CUSTOMER_SERVICE_WINDOW_MS);
 *   4. no number on either side blocks both;
 *   5. otherwise eligible, on the contact's number in preference to the
 *      member's — the contact number is the one the message arrived from.
 *
 * Rule 1's member arm reads `profiles.whatsapp_opt_in = false`, which is also
 * the column's default: a member who never opted in is answered `opted_out`
 * rather than `eligible`. That is the conservative direction and it is the one
 * the table names, so it stays — but name the cost, because a review raised it
 * and the next task inherits it. It is rule 3's over-block wearing rule 1's
 * clothes: a member-owned §6 thread cannot be replied to, and C2 Task 8's UI
 * will tell staff the member "opted out" when they never opted in. Splitting
 * the reason is C2 Task 8's call, not a change to make underneath it while the
 * precedence table calls itself non-negotiable and no caller exists yet; the
 * evidence needed to split it honestly is already computed here as
 * `whatsappOptedOutAt` (see `linkedMemberWithdrawalAt`), which is non-null only
 * for a member who actually withdrew.
 *
 * Rule 1's CONTACT arm covers a linked member's recorded withdrawal too, so a
 * caller holding only a `contactId` cannot be answered `eligible` for someone
 * who unsubscribed on the profile side.
 */
function decideWhatsApp(
  purpose: WhatsAppSendPurpose,
  member: RecipientFacts | null,
  contact: RecipientFacts | null,
): WhatsAppEligibility {
  const sides = [member, contact].filter((side): side is RecipientFacts => side !== null);
  // Nothing to read is not permission to send: the pre-deploy anonymous threads
  // resolve to no recipient at all (nothing can backfill `conversations.contact_id`
  // — the owner key is a non-invertible HMAC), and they must not fall through.
  if (sides.length === 0) return {status: "blocked", reason: "no_number"};
  const withdrew = (member !== null && !member.whatsappOptIn)
    || (contact !== null && contact.whatsappOptedOutAt !== null);
  if (withdrew) return {status: "blocked", reason: "opted_out"};
  if (purpose === "marketing" && sides.some((side) => side.whatsappSuppressed)) {
    return {status: "blocked", reason: "suppressed"};
  }
  if (purpose === "marketing" && !sides.some((side) => side.whatsappOptIn)) {
    return {status: "blocked", reason: "not_opted_in"};
  }
  const phoneE164 = sendableNumber(contact) ?? sendableNumber(member);
  if (phoneE164 === null) return {status: "blocked", reason: "no_number"};
  return {status: "eligible", phoneE164};
}

/**
 * PRIVATE. The answer, once, for every door. Both gates below authorize and
 * parse first and then call this — a second copy of the read-and-decide body is
 * exactly how two doors start disagreeing about one person.
 */
async function answerWhatsApp(
  loadDatabase: AutomationDatabaseLoader,
  parsed: z.infer<typeof eligibilityInputSchema>,
): Promise<WhatsAppEligibility> {
  if (parsed.profileId === null && parsed.contactId === null) {
    return {status: "blocked", reason: "no_number"};
  }
  const database = await loadDatabase();
  const member = parsed.profileId === null
    ? null
    : await loadRecipientFacts(database, {kind: "member", profileId: parsed.profileId});
  const contact = parsed.contactId === null
    ? null
    : await loadRecipientFacts(database, {kind: "contact", contactId: parsed.contactId});
  return decideWhatsApp(parsed.purpose, member, contact);
}

export function createMessageEligibilityRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    /**
     * `requireAdmin` first, parse second, database third — the order
     * `tests/unit/automation-repository-authorization.test.ts` pins across the
     * tree: those suites assert `loadDatabase` was never called for a refused
     * actor, so a refusal can never be observed as a query.
     *
     * `input.phoneE164` is parsed and then deliberately takes no part in the
     * answer. The number that comes back is read from the row, never from the
     * caller: a caller-supplied number would let a recipient we hold no consent
     * facts for be sent to, which is the whole hazard this module exists for.
     * It is in the shape because every call site already holds it and a
     * malformed one should be rejected at the boundary rather than at Woztell.
     */
    async whatsAppEligibility(actor: Actor, input: unknown): Promise<WhatsAppEligibility> {
      requireAdmin(actor);
      return await answerWhatsApp(loadDatabase, eligibilityInputSchema.parse(input));
    },

    /**
     * The BOT lane's door, added by the C-1 consent review.
     *
     * `lib/ai/woztell-webhook.ts` decided the concierge's opt-in question from
     * `profile?.whatsappOptIn ?? true`. A sender with no profile was therefore
     * always opted in, and the lane consulted `contacts.whatsapp_opted_out_at`
     * nowhere at all — so a prospect who said STOP was answered by the bot the
     * next time they wrote. The fix is not a second consent reader with its own
     * precedence; it is this door onto the same `loadRecipientFacts` and the same
     * `decideWhatsApp`, so the answer the bot gets and the answer staff get
     * cannot drift apart.
     *
     * A separate door rather than a widened `requireAdmin`, for the reason the
     * module header already gives about its two other gates: the webhook holds a
     * capability minted in server-only wiring, not a session, and one gate that
     * admitted both would be forgeable from whichever side is weaker.
     */
    async whatsAppEligibilityForWebhook(actor: unknown, input: unknown): Promise<WhatsAppEligibility> {
      requireWoztellWebhook(actor);
      return await answerWhatsApp(loadDatabase, eligibilityInputSchema.parse(input));
    },
    /**
     * The DISPATCHER's door (C2 Task 3), and the third gate on this module.
     *
     * It returns the facts rather than a verdict because its callers do not all
     * ask the same question: C2 Task 8's classifier folds `whatsappOptedOutAt`,
     * `whatsappSuppressed` and `marketingConsent` into an eligibility category
     * for a blast preview, `lib/notifications/dispatch.ts` picks a channel, and
     * both need the facts separately — `decideWhatsApp`'s five-way precedence
     * answers only the WhatsApp send question. The facts still come from ONE
     * loader, so a preview and a send cannot disagree about a person.
     *
     * `requireDeliveryActor` and not `requireAdmin`: the dispatcher holds a
     * capability minted in server-only wiring and has no `profileId` for
     * `requireAdmin` to check, while a session admin cannot mint the symbol.
     * Neither gate can be widened to cover the other without becoming forgeable
     * from whichever side is weaker — the reason the module header gives for
     * its other two doors, applied a third time.
     *
     * Authorize, parse, then open the database, the order every repository in
     * this tree keeps: a refusal must never be observable as a query.
     */
    async factsFor(actor: DeliveryActor, recipient: unknown): Promise<RecipientFacts | null> {
      requireDeliveryActor(actor);
      const parsed = recipientSchema.parse(recipient);
      return await loadRecipientFacts(await loadDatabase(), parsed);
    },
  };
}

export type MessageEligibilityRepository = ReturnType<typeof createMessageEligibilityRepository>;
export const messageEligibilityRepository = createMessageEligibilityRepository();
