import "server-only";

import {createHash} from "node:crypto";

import {z} from "zod";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {woztellCredentialsFrom} from "@/lib/ai/woztell-credentials";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdmin} from "@/lib/auth/authorize";
import type {ChannelAdapter, WhatsAppRecipient} from "@/lib/channels/types";
import {createWoztellAdapter, CUSTOMER_SERVICE_WINDOW_MS, WoztellDeliveryFailure} from "@/lib/channels/woztell";
import {aiEnv} from "@/lib/config/env";
import {
  inboxRepository,
  providerRefusedSend,
  type InboxConversationSummary,
  type InboxRepository,
  type StaffOutboundKind,
} from "@/lib/db/repos/inbox";
import {
  messageEligibilityRepository,
  type MessageEligibilityRepository,
  type WhatsAppEligibility,
  type WhatsAppEligibilityBlockReason,
} from "@/lib/db/repos/message-eligibility";
import type {Actor} from "@/lib/membership/lifecycle";
import {approvedTemplateKeys} from "@/lib/whatsapp/approved-templates";

/**
 * The actor-taking core of the inbox reply lane. It must never live in a
 * `"use server"` module: that directive publishes every export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the `actor`
 * performs no authorization at all. Only the `…Action(path, formData)` wrappers
 * in `lib/admin/inbox-actions.ts` are dispatchable, and each resolves the actor
 * from the session itself.
 *
 * Shaped on `lib/admin/profile-review-core.ts` deliberately, and NOT on
 * `lib/admin/task-actions.ts`, which hand-writes its `revalidatePath` calls,
 * resolves its actor through a dynamic `await import`, and lets an
 * authorization denial escape as an error rather than a 404 — leaking the
 * existence of the admin surface that every other admin mutation hides.
 */

// IMPORTED, not retyped. `lib/channels/woztell.ts` exports the constant
// `sendSessionMessage` actually enforces against; a retyped `24 * 60 * 60 *
// 1_000` here is how a countdown comes to promise a window the adapter then
// refuses. Re-exported so Task 8's composer reads the same one.
export {CUSTOMER_SERVICE_WINDOW_MS};

export type InboxReplyInput = Readonly<{
  conversationId: string;
  kind: StaffOutboundKind;
  content: string;
  templateKey: string | null;
  templateVariables: Readonly<Record<string, string>>;
  /**
   * The composer's per-attempt token — see `outboundKeyFor` for what it bounds
   * and why nothing else could.
   */
  attemptId: string;
}>;

export type InboxReplyResult = Readonly<{status: "sent" | "already_sent"; messageId: string}>;

/**
 * Every code the composer can render, and every one of them has a producer
 * below — asserted as a set equality in `tests/unit/inbox-action-core.test.ts`,
 * because a translated string with no code path that raises it reads as handled
 * in review and is not. Adding a code here without a producer fails that test;
 * so does producing one that is not listed.
 */
export const INBOX_REPLY_ERROR_CODES = [
  "INVALID",
  "FORBIDDEN",
  "WINDOW_CLOSED",
  "NOT_OPTED_IN",
  "OPTED_OUT",
  "SUPPRESSED",
  "NO_NUMBER",
  "INVALID_INBOX_CHANNEL",
  "INVALID_INBOX_HANDLING",
  "TEMPLATE_NOT_APPROVED",
  "SEND_IN_PROGRESS",
  "DELIVERY_FAILED",
  "DELIVERY_UNCERTAIN",
] as const;

export type InboxReplyErrorCode = (typeof INBOX_REPLY_ERROR_CODES)[number];

/**
 * The message IS the code, so `isAuthorizationDenial` still recognises a
 * `FORBIDDEN` that passed through here and the wrapper can 404 it exactly as it
 * would a raw `AuthorizationError`.
 */
export class InboxReplyError extends Error {
  readonly code: InboxReplyErrorCode;

  constructor(code: InboxReplyErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "InboxReplyError";
    this.code = code;
  }
}

/**
 * The one translation from a thrown value to a code the UI may render.
 *
 * Deliberately narrow: an `Error` whose message happens to spell a code is NOT
 * one of ours. Widening it to a message match would let any repository throw a
 * string into the composer's error map — and `lib/db/repos/inbox.ts` throws
 * several (`INBOX_CONVERSATION_NOT_FOUND`, `INBOX_MESSAGE_NOT_FOUND`) that are
 * bugs, not messages for staff.
 */
export function inboxReplyErrorCode(error: unknown): InboxReplyErrorCode | null {
  if (error instanceof InboxReplyError) return error.code;
  // Covers `requireAdmin`'s own AuthorizationError and any denial raised inside
  // a repository this core called.
  if (isAuthorizationDenial(error)) return "FORBIDDEN";
  return null;
}

export type InboxReplyState = Readonly<{
  /**
   * `already_sent` is its own state and never folds into `sent`. It means a row
   * under this `outbound_key` had already settled and the adapter was never
   * called — the member received nothing from THIS attempt. Reported as "Sent."
   * it is a lost reply dressed as a success, and the composer clears the draft
   * that was the only remaining copy of the text on the way out.
   */
  status: "idle" | "sent" | "already_sent" | "error";
  code?: InboxReplyErrorCode;
  messageId?: string;
}>;

export type ReplyWindow = Readonly<{state: "open" | "closed" | "never"; remainingMs: number}>;

/**
 * The 24-hour customer-service window, as the composer's countdown and as this
 * module's pre-flight check, from the same constant the adapter enforces.
 *
 * The boundary is `elapsed > CUSTOMER_SERVICE_WINDOW_MS`, character for
 * character what `sendSessionMessage` tests, so the two can never disagree about
 * the last millisecond. `null` is `never` rather than `open`: a thread nobody has
 * written into has no window at all, and reading a missing timestamp as an open
 * one would offer staff a free-text reply WhatsApp will refuse.
 */
export function replyWindow(lastInboundAt: Date | null, now: Date = new Date()): ReplyWindow {
  if (!(lastInboundAt instanceof Date) || !Number.isFinite(lastInboundAt.getTime())) {
    return {state: "never", remainingMs: 0};
  }
  const elapsed = now.getTime() - lastInboundAt.getTime();
  if (elapsed > CUSTOMER_SERVICE_WINDOW_MS) return {state: "closed", remainingMs: 0};
  return {state: "open", remainingMs: Math.max(0, CUSTOMER_SERVICE_WINDOW_MS - elapsed)};
}

/**
 * The countdown's two numbers, formatted on the SERVER from the same
 * `ReplyWindow` the send gate reads.
 *
 * Deliberately not a live clock in the composer: a `setInterval` there would
 * tick a number nothing consults — the enforcement is `sendInboxReply`'s window
 * check and the adapter's own — so a ticking display would keep counting down
 * past a boundary the server had already closed, and the first thing staff would
 * learn about it is a refused send. A number that goes stale on a page that must
 * be reloaded to change anything else is the honest one.
 *
 * Floored rather than rounded: "1h 0m left" that is really 30 seconds is a
 * promise the adapter breaks.
 */
export function formatReplyWindow(window: ReplyWindow): Readonly<{hours: string; minutes: string}> {
  const remaining = window.state === "open" ? Math.max(0, window.remainingMs) : 0;
  return {
    hours: String(Math.floor(remaining / 3_600_000)),
    minutes: String(Math.floor((remaining % 3_600_000) / 60_000)),
  };
}

export type InboxReplyDependencies = Readonly<{
  inbox: Pick<InboxRepository, "getTranscript" | "queueStaffMessage" | "settleStaffMessage">;
  eligibility: Pick<MessageEligibilityRepository, "whatsAppEligibility">;
  channel: Pick<ChannelAdapter, "sendSessionMessage" | "sendTemplateMessage">;
  /**
   * Either shape, because C-7 (C2 Task 2) made the module function `async` while
   * every fixture in the suite injects a plain `Set`. The call site `await`s, so
   * a synchronous stub and the real registry read are both correct here — and a
   * fixture that had to become a promise would have been eight files of churn
   * for a gate they are not testing.
   */
  approvedTemplateKeys: () => ReadonlySet<WhatsAppTemplateKey> | Promise<ReadonlySet<WhatsAppTemplateKey>>;
  now: () => Date;
}>;

export type InboxConversationWriter = Pick<InboxRepository, "setHandling" | "assign" | "markRead" | "close">;

function defaultInboxReplyDependencies(): InboxReplyDependencies {
  const ai = aiEnv();
  return {
    inbox: inboxRepository,
    eligibility: messageEligibilityRepository,
    channel: createWoztellAdapter({
      ...woztellCredentialsFrom(ai),
      // Every construction site must pass this explicitly.
      // `lib/jobs/runners.ts:421-427` records the incident: an outbound path
      // omitted it, the adapter found no live credentials, and journey and
      // dunning WhatsApp messages were recorded as delivered while nothing left
      // the building — a member in dunning never got the reminder the log says
      // they did. Omitting it here would fail as a clean success with a `mock:`
      // provider id written into the messages row, so nothing would alert.
      // C-9 (O-8) made it the parsed `aiEnv()` field rather than a bare
      // `process.env` read, so a typo cannot downgrade this lane in silence.
      RUN_LIVE_WOZTELL: ai.runLiveWoztell,
    }),
    approvedTemplateKeys: async () => await approvedTemplateKeys(),
    now: () => new Date(),
  };
}

const conversationIdSchema = z.string().uuid()
  // The repository's `outbound_key` regex is `[0-9a-f-]{36}` and its second
  // refine requires the key to start with `inbox:<conversationId>:`. An
  // upper-case uuid would satisfy `z.string().uuid()` here, mint a key the
  // repository refuses, and turn a perfectly ordinary reply into a parse error
  // two layers down. Normalise once, at the boundary that mints the key.
  .transform((value) => value.toLowerCase());

const replyInputSchema = z.object({
  conversationId: conversationIdSchema,
  kind: z.enum(["session", "template"]),
  content: z.string().trim().min(1).max(4_096),
  templateKey: z.string().trim().min(1).max(120).nullable().default(null),
  templateVariables: z.record(z.string().max(1_000)).default({}),
  // Required, never defaulted: see `outboundKeyFor`. Lower-cased for the reason
  // `conversationIdSchema` is — the key it feeds has to be reproducible byte for
  // byte by the next submit of the same attempt, and a client that upper-cased
  // a uuid would mint a second key for one attempt.
  attemptId: z.string().uuid().transform((value) => value.toLowerCase()),
}).strict()
  .refine((value) => value.kind === "session" || value.templateKey !== null, {message: "TEMPLATE_KEY_REQUIRED"});

const handlingSchema = z.enum(["bot", "human", "closed"]);
const assigneeSchema = z.preprocess(
  // A `<select>` submits "" for "nobody", and `formData.get` returns null for a
  // control that was never rendered. Both mean unassign; neither is a profile id.
  (value) => (value === "" || value === undefined ? null : value),
  z.string().min(1).max(255).nullable(),
);

/**
 * The eligibility module's vocabulary, mapped once. A `satisfies Record<…>`
 * rather than a lookup with a default, so a new block reason is a compile error
 * here — the alternative is a blocked send reported to staff as the wrong
 * reason, which is worse than a build failure.
 */
const ELIGIBILITY_CODES = {
  no_number: "NO_NUMBER",
  not_opted_in: "NOT_OPTED_IN",
  opted_out: "OPTED_OUT",
  suppressed: "SUPPRESSED",
} as const satisfies Record<WhatsAppEligibilityBlockReason, InboxReplyErrorCode>;

/** Errors the repository raises that are staff-facing rather than bugs. */
const REPOSITORY_CODES: Readonly<Record<string, InboxReplyErrorCode>> = {
  INVALID_INBOX_CHANNEL: "INVALID_INBOX_CHANNEL",
  INVALID_INBOX_HANDLING: "INVALID_INBOX_HANDLING",
  INBOX_CONVERSATION_NOT_FOUND: "INVALID",
  INBOX_MESSAGE_NOT_FOUND: "INVALID",
};

/**
 * Generic over the SCHEMA rather than over an output type, so `.default(…)` and
 * `.transform(…)` are reflected in what the caller gets. Typed as `z.ZodType<T>`
 * this returned the input type, and every defaulted field came back
 * `| undefined` — the sort of widening that ends in a `?? {}` at the call site
 * and a silently empty template-variable bag.
 */
function parsed<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new InboxReplyError("INVALID", {cause: result.error});
  return result.data;
}

/**
 * Runs a repository call and gives its refusals a code staff can read.
 *
 * Authorization denials pass through untouched so the `"use server"` wrapper's
 * `isAuthorizationDenial(error) → notFound()` still fires; anything unrecognised
 * also passes through, because a 500 on an unexpected failure is honest and a
 * translated "check the message and the template" on one is not.
 */
async function throughRepository<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) throw new InboxReplyError("INVALID", {cause: error});
    const code = error instanceof Error ? REPOSITORY_CODES[error.message] : undefined;
    if (code) throw new InboxReplyError(code, {cause: error});
    throw error;
  }
}

/**
 * What the adapter is told about the recipient, derived from the eligibility
 * answer and from nothing else.
 *
 * `lib/channels/woztell.ts:72` refuses to send when `whatsappOptIn` is false —
 * it is the adapter's own consent gate, not a marketing flag — so the value
 * handed to it must be the decision made by the module that owns consent for
 * this send.
 *
 * It is emphatically NOT `queueStaffMessage`'s `recipient.whatsappOptIn`.
 * `contacts.whatsapp_opt_in` is `.default(false).notNull()` and
 * `upsertFromWhatsApp` never sets it (its own comment says so), so **every
 * prospect who messages the WTIA number is `whatsapp_opt_in = false` forever**.
 * Passing that raw flag would turn every staff reply to the population Phase C
 * exists to serve into `{status: "skipped", reason: "recipient_ineligible"}` —
 * silently, on the mock path as well as the live one, because `send()` applies
 * that gate before it checks for credentials. S-9 rule 3 draws the same line for
 * the same reason: the gate on a service reply is the 24-hour window, not a
 * marketing consent flag.
 *
 * The number is eligibility's too, read from the row rather than supplied by the
 * caller, so a reply can only ever reach a recipient we hold consent facts for.
 */
export function adapterRecipient(eligibility: WhatsAppEligibility): WhatsAppRecipient {
  return {
    whatsappNumber: eligibility.status === "eligible" ? eligibility.phoneE164 : null,
    whatsappOptIn: eligibility.status === "eligible",
  };
}

/**
 * `"inbox:" + conversationId + ":" + sha256(kind, content, templateKey, sorted
 * variables, attemptId).slice(0, 32)` — plan S-8, corrected by C-2.
 *
 * **The dedupe window is one send attempt, not a span of time.** It opens when
 * staff start composing a reply and closes the moment the server reports that
 * attempt reached the provider; two submits inside it are one row, and anything
 * after it is a new reply.
 *
 * It used to be unbounded, and that dropped replies. The hash covered the draft
 * and nothing else, `messages_outbound_key_unique` is permanent, and C1 exempted
 * human-handled and closed threads from both retention sweeps
 * (lib/db/repos/chat-retention.ts, lib/db/repos/conversations.ts) — so no row
 * carrying one of these keys is ever deleted. The second time staff sent an
 * identical sentence into one thread, days later, to a prospect who had written
 * in again, the INSERT conflicted, the claim `UPDATE` refused a settled `sent`
 * row, the fallback SELECT answered `already_sent` and this module returned
 * before the adapter. The member received nothing, the transcript grew no row,
 * and no audit row recorded the attempt. An inbox runs on canned replies, as
 * lib/db/repos/woztell-inbound-events.ts says itself, so the collision is the
 * ordinary case rather than an edge one.
 *
 * `attemptId` is the fix and it is deliberately NOT a clock. A time bucket has
 * an edge, and a double-click that straddles it is exactly the event this key
 * exists to stop; widening the bucket to make the edge rare widens the span in
 * which a deliberate re-send is swallowed. There is no width that is both. The
 * composer is the only thing that knows "this is the same attempt as the last
 * submit", so it mints the token, keeps it beside the draft in `sessionStorage`
 * (so a reload, and the retry after a timeout, still find the same row) and
 * rotates it once a send reaches the provider. What the key still stops:
 *
 *   - the double-click and the Server Action a client retried — same live form,
 *     same token, one row, and the claim lease then dedupes the send itself;
 *   - the retry after a crash between the adapter and the settle — the draft and
 *     its token both come back from `sessionStorage`, so the row is inherited
 *     rather than duplicated;
 *   - a re-take of a send the provider definitively refused, which is the same
 *     row under the same key.
 *
 * What it no longer stops, on purpose: the same sentence sent again as a new
 * attempt. That was never dedupe; it was data loss.
 *
 * The token is REQUIRED rather than defaulted. A missing one would silently
 * disable the dedupe, which is the failure mode the key exists to prevent, and
 * a fallback that is not deterministic in the attempt dedupes nothing — so a
 * hand-posted formData without one is `INVALID` instead. The residual is honest
 * and small: with site data blocked `sessionStorage` throws, the token lives
 * only for the life of the mounted composer, and a reload mid-send mints a new
 * one. The claim lease still covers the first two minutes of that, and beyond it
 * the old design re-took the row and sent again anyway.
 *
 * The five inputs are hashed as JSON rather than joined on "|" so a message
 * whose text contains the separator cannot collide with a different draft —
 * a collision here is one reply silently replacing another.
 */
export function outboundKeyFor(input: InboxReplyInput): string {
  const variables = Object.keys(input.templateVariables)
    .sort()
    .map((key) => [key, input.templateVariables[key] ?? ""]);
  const digest = createHash("sha256")
    .update(JSON.stringify([input.kind, input.content, input.templateKey, variables, input.attemptId]))
    .digest("hex")
    .slice(0, 32);
  return `inbox:${input.conversationId}:${digest}`;
}

/**
 * Which code an adapter failure is reported to staff under.
 *
 * C-2. The question the message has to answer is not "how did the send fail"
 * but "what will a second Send click do", and only `PROVIDER_REFUSED_SEND` can
 * answer it: a row whose `error_code` it classifies as a definite refusal is
 * re-taken by `queueStaffMessage`'s claim `UPDATE`, so the retry genuinely
 * re-sends. Every other code leaves the row settled, so the retry short-circuits
 * to `already_sent` and nothing is sent — and `DELIVERY_FAILED`'s string invites
 * exactly that click. `retryable_network`, `provider_acceptance_uncertain` and
 * `provider_unclassified_failure` all fall on that side, and the last is the
 * most likely bring-up failure of all (plan O-1).
 *
 * `recipient_ineligible` — the adapter's `skipped` outcome — is not a Woztell
 * failure code and is not re-takeable either, so it lands here too. It is
 * unreachable while `adapterRecipient` derives from an `eligible` answer, which
 * is why it is routed rather than assumed away.
 */
function deliveryFailureCode(errorCode: string): InboxReplyErrorCode {
  return providerRefusedSend(errorCode) ? "DELIVERY_FAILED" : "DELIVERY_UNCERTAIN";
}

/**
 * Send a staff reply into an existing WhatsApp thread.
 *
 * The order is the design (S-7, S-8, S-9), not a preference:
 *
 *   requireAdmin → parse → read the thread → channel/handling → eligibility →
 *   window (session) → template approval → queueStaffMessage → short-circuit →
 *   adapter → settleStaffMessage
 *
 * Everything that can refuse the send runs BEFORE `queueStaffMessage`, because
 * that call writes the `conversation.reply.queued` audit row — the durable
 * commitment to send — in the same transaction as the row. Filing that
 * commitment for a reply we then refuse would make the audit trail a record of
 * intentions rather than of sends.
 *
 * S-12: replies go into threads that already exist. Opening a new thread to a
 * contact who has never written in needs an owner hash, a template and a
 * decision about contacts with no number; it is C-4/C-2 work and the §6 gate
 * does not ask for it.
 */
export async function sendInboxReply(
  actor: Actor,
  input: unknown,
  deps: InboxReplyDependencies = defaultInboxReplyDependencies(),
): Promise<InboxReplyResult> {
  requireAdmin(actor);
  const reply = parsed(replyInputSchema, input);

  const transcript = await throughRepository(() => deps.inbox.getTranscript(actor, reply.conversationId));
  if (transcript === null) throw new InboxReplyError("INVALID");
  const conversation = transcript.conversation;
  // The row-level checks in `queueStaffMessage` are the authority — only it
  // holds `FOR UPDATE`. These two are here so the eligibility read and the
  // window arithmetic are not run for a thread that plainly cannot be replied
  // to, and so the codes have a producer that does not depend on a race.
  if (conversation.channel !== "whatsapp") throw new InboxReplyError("INVALID_INBOX_CHANNEL");
  if (conversation.handling !== "human") throw new InboxReplyError("INVALID_INBOX_HANDLING");

  const eligibility = await throughRepository(() => deps.eligibility.whatsAppEligibility(actor, {
    profileId: conversation.profileId,
    contactId: conversation.contactId,
    // The module parses this and then ignores it: the number it answers with is
    // read from the row, never supplied by a caller. Passing null keeps that
    // honest rather than round-tripping a value we did not read.
    phoneE164: null,
    // A free-text reply inside the window is a direct answer to a message the
    // recipient sent us minutes ago; an approved template outside it is not.
    purpose: reply.kind === "session" ? "service" : "marketing",
  }));
  if (eligibility.status === "blocked") throw new InboxReplyError(ELIGIBILITY_CODES[eligibility.reason]);

  if (reply.kind === "session" && replyWindow(conversation.lastInboundAt, deps.now()).state !== "open") {
    throw new InboxReplyError("WINDOW_CLOSED");
  }

  const templateKey = reply.templateKey;
  if (reply.kind === "template") {
    // Two checks, both server-side, both before the adapter.
    //
    // 1. `sendTemplateMessage` does a bare property lookup
    //    (`WHATSAPP_TEMPLATES[input.template].name`), so an unknown key is a
    //    TypeError mid-send rather than a typed delivery failure.
    if (templateKey === null || !Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, templateKey)) {
      throw new InboxReplyError("INVALID");
    }
    // 2. Approval, from the same module the picker reads. Enforcing this in a
    //    `<select>` alone would let a hand-posted formData carrying any config
    //    key reach `sendTemplateMessage` — an unapproved elementName is a
    //    provider 4xx, a permanent failure and a staff task per recipient (O-7).
    if (!(await deps.approvedTemplateKeys()).has(templateKey as WhatsAppTemplateKey)) {
      throw new InboxReplyError("TEMPLATE_NOT_APPROVED");
    }
  }

  const outboundKey = outboundKeyFor(reply);
  // Spelled out rather than spread. `queueStaffMessageSchema` is `.strict()`, so
  // a field on the reply input it does not declare is a ZodError two layers
  // down — reported to staff as "Check the message and the template" for EVERY
  // reply in the product, and invisible to every test on either side of this
  // boundary, because each one substitutes the other. C-2 added `attemptId` and
  // did exactly that; `tests/unit/inbox-repeat-reply.test.ts` now drives the
  // real repository method so the next such field cannot ship.
  //
  // `attemptId` is deliberately not among these: it is already folded into
  // `outboundKey`, and a column the repository would store it in would be a
  // second, weaker copy of the same fact.
  const queued = await throughRepository(() => deps.inbox.queueStaffMessage(actor, {
    conversationId: reply.conversationId,
    kind: reply.kind,
    content: reply.content,
    templateKey: reply.templateKey,
    templateVariables: reply.templateVariables,
    outboundKey,
  }));
  // Both short-circuits skip the adapter and they mean different things (S-8).
  // `already_sent` is a settled row: this draft has already gone. `already_queued`
  // is a LIVE send claim held by another submit — a double-click, or a Server
  // Action the client retried — and calling the adapter anyway is how one
  // messages row and one audit row become two WhatsApp messages to the member.
  if (queued.disposition === "already_sent") return {status: "already_sent", messageId: queued.messageId};
  if (queued.disposition === "already_queued") throw new InboxReplyError("SEND_IN_PROGRESS");

  const recipient = adapterRecipient(eligibility);
  let outcome;
  try {
    outcome = reply.kind === "session"
      ? await deps.channel.sendSessionMessage({
        ...recipient,
        text: reply.content,
        idempotencyKey: outboundKey,
        // The PERSISTED window clock, read inside the same transaction that
        // claimed the send — not the summary the page rendered from, which may
        // be minutes stale, and not a value the client supplied. A null here
        // means the row says nobody has ever written in; `new Date(0)` is the
        // inert choice, because the adapter refuses it and the refusal maps to
        // the same WINDOW_CLOSED the pre-flight check would have produced.
        lastCustomerMessageAt: queued.lastInboundAt ?? new Date(0),
      })
      : await deps.channel.sendTemplateMessage({
        ...recipient,
        template: templateKey as WhatsAppTemplateKey,
        variables: reply.templateVariables,
        idempotencyKey: outboundKey,
      });
  } catch (error) {
    if (!(error instanceof WoztellDeliveryFailure)) throw error;
    // `error.code` verbatim. `queueStaffMessage` decides whether a failed row
    // may be re-taken by reading exactly this column, so a caller that
    // substitutes a summary of its own makes every failure un-resendable —
    // fail-closed, but silently.
    await settle(actor, deps, outboundKey, {status: "failed", errorCode: error.code});
    // The SAME column decides which of the two codes staff see, so the message
    // and the statement that will answer their next click cannot disagree.
    throw new InboxReplyError(deliveryFailureCode(error.code), {cause: error});
  }

  if (outcome.status === "blocked") {
    // The adapter's own window check refused it. Mapped to the same code the
    // countdown uses: two enforcement points, one thing to tell staff, and
    // neither of them may be the only check.
    await settle(actor, deps, outboundKey, {status: "failed", errorCode: outcome.reason});
    throw new InboxReplyError("WINDOW_CLOSED");
  }
  if (outcome.status === "skipped") {
    // Unreachable while `adapterRecipient` is derived from an `eligible`
    // answer — which is exactly why it is recorded rather than assumed away: if
    // it ever fires, the row says which gate disagreed with which.
    await settle(actor, deps, outboundKey, {status: "failed", errorCode: outcome.reason});
    throw new InboxReplyError(deliveryFailureCode(outcome.reason));
  }

  await settle(actor, deps, outboundKey, {status: "sent", providerId: outcome.providerId});
  return {status: "sent", messageId: queued.messageId};
}

async function settle(
  actor: Actor,
  deps: InboxReplyDependencies,
  outboundKey: string,
  outcome: Readonly<{status: "sent"; providerId: string} | {status: "failed"; errorCode: string}>,
): Promise<void> {
  await throughRepository(() => deps.inbox.settleStaffMessage(actor, {outboundKey, outcome}));
}

export async function setInboxHandling(
  actor: Actor,
  conversationId: unknown,
  handling: unknown,
  deps: InboxConversationWriter = inboxRepository,
): Promise<InboxConversationSummary> {
  requireAdmin(actor);
  return await throughRepository(() => deps.setHandling(actor, {
    conversationId: parsed(conversationIdSchema, conversationId),
    handling: parsed(handlingSchema, handling),
  }));
}

export async function assignInboxConversation(
  actor: Actor,
  conversationId: unknown,
  assignee: unknown,
  deps: InboxConversationWriter = inboxRepository,
): Promise<InboxConversationSummary> {
  requireAdmin(actor);
  return await throughRepository(() => deps.assign(actor, {
    conversationId: parsed(conversationIdSchema, conversationId),
    assignedToProfileId: parsed(assigneeSchema, assignee),
  }));
}

export async function markInboxRead(
  actor: Actor,
  conversationId: unknown,
  deps: InboxConversationWriter = inboxRepository,
): Promise<void> {
  requireAdmin(actor);
  await throughRepository(() => deps.markRead(actor, parsed(conversationIdSchema, conversationId)));
}

export async function closeInboxConversation(
  actor: Actor,
  conversationId: unknown,
  deps: InboxConversationWriter = inboxRepository,
): Promise<InboxConversationSummary> {
  requireAdmin(actor);
  return await throughRepository(() => deps.close(actor, parsed(conversationIdSchema, conversationId)));
}
