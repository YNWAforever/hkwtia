import "server-only";

import {z} from "zod";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import type {AppLocale} from "@/i18n/routing";
import {
  campaignEmailFor,
  campaignNumberFor,
  type CampaignReportReason,
  classifyRecipient,
} from "@/lib/admin/campaign-eligibility";
import type {AutomationRepositoryActor} from "@/lib/auth/automation-actor";
import type {MessageClassification} from "@/lib/automation/types";
import type {ChannelAdapter} from "@/lib/channels/types";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {aiEnv, emailEnv} from "@/lib/config/env";
import {
  deliveriesRepository,
  type DeliveriesRepository,
  type DeliveryCompletion,
  type DeliveryReservation,
  type NotificationActor,
} from "@/lib/db/repos/deliveries";
import {
  messageEligibilityRepository,
  type MessageEligibilityRepository,
  type RecipientFacts,
} from "@/lib/db/repos/message-eligibility";
import {
  whatsappTemplatesRepository,
  type WhatsAppTemplatesRepository,
} from "@/lib/db/repos/whatsapp-templates";
import {
  EMAIL_TEMPLATE_IDS,
  getEmailTemplate,
  type EmailTemplateId,
} from "@/lib/email/catalog";
import {renderEmail as renderEmailFn} from "@/lib/email/render";
import {
  createConfiguredEmailTransport,
  type DeliveryFailureCode,
  type EmailTransport,
} from "@/lib/email/transport";
import {unsubscribeUrls as unsubscribeUrlsFn} from "@/lib/email/unsubscribe-urls";
import {approvedTemplateKeys} from "@/lib/whatsapp/approved-templates";

/**
 * Programme C-8, Phase C2 Task 11. One place that answers "may we send this to
 * this person, and did we already?" for both channels and both recipient kinds.
 *
 * It exists because the two paths it unifies had different idempotency models:
 * `lib/db/repos/deliveries.ts` reserves a row, sends, then completes it, while
 * `lib/ai/woztell-delivery.ts` keeps a six-state ledger in `messages.metadata`.
 * Its first production caller is the campaign send queue
 * (`runWhatsAppCampaignBatch`, Task 10) — that is deliberate, and it is why this
 * module lands in Phase C rather than Phase D. A module that exists and nobody
 * calls reads as done in every later review, and Task 10 would otherwise have
 * inlined this exact sequence beside it: two WhatsApp send paths built in one
 * phase, with the rules below governing the one that never runs.
 *
 * **What it orchestrates and never does itself.** It holds no SQL and calls no
 * `getDb`: the eligibility read, both delivery ledgers and the template registry
 * are repositories, each of which authorizes the actor it is handed (boundary 1
 * and 2). It takes its transports rather than constructing them, so tests keep
 * using `createTestTransport()`.
 *
 * **The consent gate is `classifyRecipient`, which is a MARKETING classifier,
 * and that is the conservative direction on purpose.** A campaign and its
 * preview must agree about a person, so the send-time recheck has to fold the
 * facts exactly the way `campaignAudience` folded them at snapshot time — the
 * queue-time snapshot narrows the audience and this catches anyone who opted out
 * in between, which is the whole "one STOP suppresses that member from the next
 * blast" guarantee. The cost is named rather than hidden: a TRANSACTIONAL send
 * routed through here would also be refused for a member who never gave
 * marketing consent, because the classifier has no `purpose` parameter the way
 * `whatsAppEligibility` does. That is why the four transactional callers below
 * are NOT converted in this phase.
 *
 * **Callers deliberately not converted, so the next reader knows the list was
 * considered rather than forgotten** (all four are Phase D follow-up):
 * `lib/events/guest-registration-core.ts` (B-4) and `lib/showcase/lead-actions.ts`
 * swallow every delivery failure with a stated reason, and routing them through
 * a path that writes a database row changes their failure surface; B-2's join
 * acknowledgement and B-5's event reminder stay on the journey runner for the
 * same reason plus the purpose gap above. C1's inbox reply lane
 * (`lib/admin/inbox-action-core.ts`) is a fifth candidate — it is a `service`
 * send inside the customer-service window, so it needs the purpose parameter
 * before it can move.
 */

/** A capability principal, never a session: see `requireDeliveryActor`. */
type DispatchActor = NotificationActor | AutomationRepositoryActor;

export type NotificationRecipient =
  | Readonly<{kind: "member"; profileId: string}>
  | Readonly<{kind: "contact"; contactId: string}>;

export type NotificationRequest =
  | Readonly<{
    recipient: NotificationRecipient;
    channel: "email";
    template: EmailTemplateId;
    variables: Readonly<Record<string, string>>;
    idempotencyKey: string;
    locale?: AppLocale;
  }>
  | Readonly<{
    recipient: NotificationRecipient;
    channel: "whatsapp";
    template: WhatsAppTemplateKey;
    variables: Readonly<Record<string, string>>;
    idempotencyKey: string;
    locale?: AppLocale;
  }>;

/**
 * `provider_acceptance_uncertain` is not a `DeliveryFailureCode` — the adapter
 * maps a provider 5xx to it and both existing runners fall through to
 * `provider_unclassified_failure`. It is carried here as its own code because
 * S-15 makes it mean something no other code means: the provider may already
 * have delivered the message, so the attempt is terminal and must never be
 * rescheduled. Collapsing it into `retryable_server` re-sends a marketing
 * template to somebody who already received it.
 */
export type NotificationFailureCode = DeliveryFailureCode | "provider_acceptance_uncertain";

/**
 * Every value here is written verbatim into `campaign_recipients.blocked_reason`
 * by Task 10's runner, so it is derived from the report's vocabulary rather
 * than restated: a skip reason with no label renders to an admin as a raw
 * English snake_case token on the row that says why a blast did not go out, and
 * that has now happened twice. Declaring it this way makes the next added
 * reason a compile error until `CampaignReportReason` names it, and a test
 * failure until `CAMPAIGN_REPORT_REASONS` — which is what the detail page
 * builds its label map from — and both bundles carry it.
 *
 * `marketing_suppressed` is the one report reason the dispatcher cannot answer:
 * it is an `error_code` the email lane of `campaign-runner.ts` writes after a
 * send is already under way, not a refusal made here. `eligible` is not a
 * report reason at all — it is the one category that is not a reason to skip.
 */
export type NotificationSkipReason = Exclude<CampaignReportReason, "marketing_suppressed">;

export type NotificationResult =
  | Readonly<{status: "sent"; providerId: string; deliveryId: string}>
  | Readonly<{status: "skipped"; reason: NotificationSkipReason}>
  | Readonly<{status: "failed"; errorCode: NotificationFailureCode; deliveryId: string}>;

export type NotificationDispatchDependencies = Readonly<{
  eligibility: Pick<MessageEligibilityRepository, "factsFor">;
  /**
   * The two `retry*Failure` methods are here and not in the plan's four because
   * the reservation's fourth disposition — `existing` + `failed` — is "the
   * existing retry path", and `completeReservedDelivery` only settles a row in
   * state `processing`. Without the retry the ledger would be written by a
   * statement that matches nothing and the send would be lost.
   */
  deliveries: Pick<
    DeliveriesRepository,
    | "reserveEmail"
    | "reserveWhatsapp"
    | "completeEmail"
    | "completeWhatsapp"
    | "retryEmailFailure"
    | "retryWhatsappFailure"
  >;
  templates: Pick<WhatsAppTemplatesRepository, "approved">;
  emailTransport: EmailTransport;
  whatsappTransport: Pick<ChannelAdapter, "sendTemplateMessage">;
  renderEmail: typeof renderEmailFn;
  unsubscribeUrls: typeof unsubscribeUrlsFn;
  emailFrom: string;
}>;

/**
 * Thrown when the LEDGER could not be written — never when the provider
 * refused. The distinction is the whole point: a provider refusal is a
 * `{status: "failed"}` result the caller settles against its own row, while a
 * ledger write that did not happen leaves the attempt unaccounted for and the
 * caller must retry the whole thing.
 *
 * `code` rather than a bare Error because both runners' `failureCode(error)`
 * reads `error.code` and falls through to `provider_unclassified_failure` —
 * which is PERMANENT. A transient Neon blip would otherwise burn the recipient.
 */
export class NotificationDispatchFailure extends Error {
  readonly code: DeliveryFailureCode;

  constructor(code: DeliveryFailureCode) {
    super(`NOTIFICATION_DISPATCH_FAILED:${code}`);
    this.name = "NotificationDispatchFailure";
    this.code = code;
  }
}

const recipientSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("member"), profileId: z.string().min(1).max(255)}).strict(),
  z.object({kind: z.literal("contact"), contactId: z.string().uuid()}).strict(),
]);

const localeSchema = z.enum(["en", "zh-HK"]);
const variablesSchema = z.record(z.string().min(1).max(64), z.string().max(2_000));

/**
 * `notify:<source>:<digest>`, enforced rather than merely documented.
 *
 * `lib/db/repos/journeys.ts` joins `email_delivery.idempotency_key = source.delivery_key`
 * and `whatsapp_delivery.idempotency_key = source.delivery_key || ':whatsapp'` in
 * BOTH `claimDue` and `retryFailed`, so a key minted in the `journey:` namespace
 * by anything but the journey runner silently disables admin retry and
 * stale-claim replay detection for that row. A regex is the cheapest place to
 * make that impossible.
 */
const IDEMPOTENCY_KEY = /^notify:[a-z0-9][a-z0-9-]{0,31}:[A-Za-z0-9:_.\-]{1,180}$/;

const emailTemplateSchema = z.enum(
  EMAIL_TEMPLATE_IDS as unknown as [EmailTemplateId, ...EmailTemplateId[]],
);
const whatsappTemplateSchema = z.enum(
  Object.keys(WHATSAPP_TEMPLATES) as [WhatsAppTemplateKey, ...WhatsAppTemplateKey[]],
);

/**
 * `.strict()` on both arms is what refuses a caller-supplied `classification`.
 * The classification of a send is a property of its TEMPLATE — `getEmailTemplate`
 * throws `EMAIL_CLASSIFICATION_OVERRIDE_FORBIDDEN` on any mismatch and
 * `tests/unit/email-catalog.test.ts` pins it — so a caller that could name one
 * could downgrade a marketing blast to transactional and lose its unsubscribe
 * footer, which is the one thing a marketing email may never ship without.
 *
 * Discriminating on `channel` also makes a wrong-vocabulary template a parse
 * error rather than a provider 4xx: `renewal_14` is a key in both catalogues and
 * `welcome` is a key in neither of the other's.
 */
const requestSchema = z.discriminatedUnion("channel", [
  z.object({
    recipient: recipientSchema,
    channel: z.literal("email"),
    template: emailTemplateSchema,
    variables: variablesSchema,
    idempotencyKey: z.string().regex(IDEMPOTENCY_KEY),
    locale: localeSchema.optional(),
  }).strict(),
  z.object({
    recipient: recipientSchema,
    channel: z.literal("whatsapp"),
    template: whatsappTemplateSchema,
    variables: variablesSchema,
    idempotencyKey: z.string().regex(IDEMPOTENCY_KEY),
    locale: localeSchema.optional(),
  }).strict(),
]);

type ParsedRequest = z.infer<typeof requestSchema>;

const PROVIDER_FAILURE_CODES = new Set<string>([
  "retryable_network",
  "retryable_rate_limit",
  "retryable_server",
  "provider_client_error",
  "provider_unclassified_failure",
  "provider_acceptance_uncertain",
]);

/**
 * Only the three transient codes are replayed against the provider. A persisted
 * `provider_client_error` fails identically on a second attempt (a rejected
 * template parameter does not heal), and `provider_acceptance_uncertain` must
 * never be retried at all (S-15) — both are returned as the failure they
 * already are, without touching the transport.
 */
const RETRYABLE_PERSISTED_CODES = new Set<string>([
  "retryable_network",
  "retryable_rate_limit",
  "retryable_server",
]);

function notificationFailureCode(value: string | null | undefined): NotificationFailureCode {
  return value !== null && value !== undefined && PROVIDER_FAILURE_CODES.has(value)
    ? value as NotificationFailureCode
    : "provider_unclassified_failure";
}

function providerFailureCodeFrom(error: unknown): NotificationFailureCode {
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
  ) {
    return notificationFailureCode(error.code);
  }
  return "provider_unclassified_failure";
}

/**
 * Meta's own classification is the source of truth for a WhatsApp send's
 * classification, exactly as the email catalogue is for an email's. The
 * registry column is seeded from this config (0034) and the `as const` here is
 * what types every call site, so the two can never disagree.
 */
function whatsappClassification(template: WhatsAppTemplateKey): MessageClassification {
  return WHATSAPP_TEMPLATES[template].category === "marketing" ? "marketing" : "transactional";
}

/**
 * Every declared BODY parameter, resolved, or nothing.
 *
 * `lib/channels/woztell.ts` builds the body as
 * `template.variables.map((key) => ({… text: input.variables[key] ?? ""}))`, and
 * Meta rejects a template whose BODY parameter is empty — a 4xx the adapter maps
 * to `provider_client_error`, which S-15 makes permanent. Task 8 already blocks
 * an unresolvable variable at snapshot time as `missing_variable`; this is the
 * same refusal at the last gate, for every caller, including the ones that never
 * go near `campaign_recipients`.
 */
function resolvedBody(
  template: WhatsAppTemplateKey,
  variables: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | null {
  const body: Record<string, string> = {};
  for (const key of WHATSAPP_TEMPLATES[template].variables) {
    const value = variables[key] ?? "";
    if (value.trim() === "") return null;
    body[key] = value;
  }
  return body;
}

type Ledger = Readonly<{
  reserve: () => Promise<DeliveryReservation>;
  retry: (id: string, expectedErrorCode: string) => Promise<Readonly<{record: Readonly<{id: string}>}>>;
  complete: (id: string, completion: DeliveryCompletion) => Promise<unknown>;
}>;

type ReservationOutcome =
  | Readonly<{kind: "send"; deliveryId: string}>
  | Readonly<{kind: "settled"; result: NotificationResult}>;

/**
 * All four dispositions `reserveWhatsapp`/`reserveEmail` can hand back, because
 * the naive version double-sends.
 *
 * `reserveWhatsapp` is `ON CONFLICT DO NOTHING` → `reserveExisting`, which
 * returns the existing row IN WHATEVER STATE IT IS IN. A recipient lease expires
 * precisely because the previous attempt did not complete — which means the row
 * is `processing`, not `sent` — so the tempting `if (status === "sent") return;`
 * guard does not fire, the recipient is re-claimed, and the same marketing
 * template goes out twice. The `processing` arm below is the one that case needs:
 * terminal, uncertain, no transport call, and the caller files a staff task
 * instead of rescheduling.
 */
async function settleReservation(
  ledger: Ledger,
  reservation: DeliveryReservation,
): Promise<ReservationOutcome> {
  const record = reservation.record;
  if (record.status === "sent") {
    // A `sent` row always carries a provider id: `completeReservedDelivery`
    // writes both in one statement and the `sent` arm of `DeliveryCompletion`
    // requires it. The fallback is there so a hand-repaired row cannot crash a
    // batch.
    return {
      kind: "settled",
      result: {status: "sent", providerId: record.providerId ?? "", deliveryId: record.id},
    };
  }
  if (record.status === "processing") {
    if (reservation.disposition === "created") return {kind: "send", deliveryId: record.id};
    return {
      kind: "settled",
      result: {
        status: "failed",
        errorCode: "provider_acceptance_uncertain",
        deliveryId: record.id,
      },
    };
  }
  const persisted = record.errorCode;
  if (persisted === null || !RETRYABLE_PERSISTED_CODES.has(persisted)) {
    return {
      kind: "settled",
      result: {
        status: "failed",
        errorCode: notificationFailureCode(persisted),
        deliveryId: record.id,
      },
    };
  }
  let retried: Readonly<{record: Readonly<{id: string}>}>;
  try {
    retried = await ledger.retry(record.id, persisted);
  } catch {
    throw new NotificationDispatchFailure("retryable_network");
  }
  return {kind: "send", deliveryId: retried.record.id};
}

async function reserveOrThrow(ledger: Ledger): Promise<DeliveryReservation> {
  try {
    return await ledger.reserve();
  } catch {
    throw new NotificationDispatchFailure("retryable_network");
  }
}

/**
 * A completion that does not land is a `processing` row, and the next attempt's
 * `existing` + `processing` disposition turns that into an uncertain acceptance
 * rather than a second send. So throwing here is safe, and it is the same thing
 * both runners do.
 */
async function completeOrThrow(
  ledger: Ledger,
  deliveryId: string,
  completion: DeliveryCompletion,
): Promise<void> {
  try {
    await ledger.complete(deliveryId, completion);
  } catch {
    throw new NotificationDispatchFailure("retryable_network");
  }
}

async function dispatchWhatsApp(
  actor: DispatchActor,
  request: Extract<ParsedRequest, {channel: "whatsapp"}>,
  facts: RecipientFacts,
  locale: AppLocale,
  dependencies: NotificationDispatchDependencies,
): Promise<NotificationResult> {
  // Fail-closed, and read here rather than in the caller: `approvedTemplateKeys`
  // returns the whole config key set off the live switch (S-14), so CI never
  // opens a database to answer this and every WhatsApp unit test stays a unit
  // test. In live mode a registry read that throws answers "nothing approved".
  const approved = await approvedTemplateKeys(dependencies.templates);
  if (!approved.has(request.template)) {
    return {status: "skipped", reason: "template_not_approved"};
  }

  const variables = resolvedBody(request.template, request.variables);
  if (variables === null) return {status: "skipped", reason: "missing_variable"};

  const whatsappNumber = campaignNumberFor(facts);
  if (whatsappNumber === null) return {status: "skipped", reason: "no_number"};

  const ledger: Ledger = {
    reserve: async () => dependencies.deliveries.reserveWhatsapp(actor, {
      profileId: facts.kind === "member" ? facts.id : null,
      // S-8: the prospect half of the audience used to log a row attributable to
      // nobody, because both log tables keyed only on `profile_id` before 0033.
      contactId: facts.kind === "contact" ? facts.id : null,
      journeyStateId: null,
      template: request.template,
      idempotencyKey: request.idempotencyKey,
      locale,
      classification: whatsappClassification(request.template),
    }),
    retry: async (id, expectedErrorCode) =>
      dependencies.deliveries.retryWhatsappFailure(actor, id, expectedErrorCode),
    complete: async (id, completion) =>
      dependencies.deliveries.completeWhatsapp(actor, id, completion),
  };

  const outcome = await settleReservation(ledger, await reserveOrThrow(ledger));
  if (outcome.kind === "settled") return outcome.result;
  const deliveryId = outcome.deliveryId;

  let provider: Awaited<ReturnType<ChannelAdapter["sendTemplateMessage"]>>;
  try {
    provider = await dependencies.whatsappTransport.sendTemplateMessage({
      whatsappOptIn: facts.whatsappOptIn,
      whatsappNumber,
      template: request.template,
      variables,
      idempotencyKey: request.idempotencyKey,
    });
  } catch (error) {
    const errorCode = providerFailureCodeFrom(error);
    await completeOrThrow(ledger, deliveryId, {status: "failed", errorCode});
    return {status: "failed", errorCode, deliveryId};
  }

  if (provider.status === "skipped") {
    // Unreachable through this module's own guards — the adapter only skips when
    // it sees no opt-in or no number, and both were established above. It is
    // handled rather than asserted because the reserved row must not be left
    // `processing`: that would turn the next attempt into an uncertain
    // acceptance for a message that never reached the provider. Reported as a
    // SKIP, not a failure, so the caller blocks the recipient instead of
    // spending a delivery attempt and a staff task on them.
    await completeOrThrow(ledger, deliveryId, {
      status: "failed",
      errorCode: "provider_client_error",
    });
    return {status: "skipped", reason: "no_number"};
  }

  await completeOrThrow(ledger, deliveryId, {status: "sent", providerId: provider.providerId});
  return {status: "sent", providerId: provider.providerId, deliveryId};
}

async function dispatchEmail(
  actor: DispatchActor,
  request: Extract<ParsedRequest, {channel: "email"}>,
  facts: RecipientFacts,
  locale: AppLocale,
  dependencies: NotificationDispatchDependencies,
): Promise<NotificationResult> {
  const to = campaignEmailFor(facts);
  if (to === null) return {status: "skipped", reason: "no_email"};

  const variables = {...request.variables, recipientName: facts.displayName};
  // Derived, never supplied. `getEmailTemplate` is the authority and refuses an
  // override; calling it here rather than reading a private map keeps one
  // definition of a template's classification in the tree.
  const {classification} = getEmailTemplate(locale, request.template, variables);

  // A prospect has no profile id, so no unsubscribe token can be signed for
  // them, and `renderEmail` throws `MARKETING_UNSUBSCRIBE_URL_REQUIRED` without
  // one — inside a runner a throw is a permanent failure plus a staff task per
  // recipient. `classifyRecipient` already answers `not_opted_in` for every
  // contact on email (a contact carries no marketing-consent column), so this is
  // belt and braces rather than the live path, and it answers with the same word
  // so the two cannot disagree in a report.
  const unsubscribe = facts.kind === "member"
    ? dependencies.unsubscribeUrls(facts.id, locale, new Date())
    : null;
  if (classification === "marketing" && unsubscribe === null) {
    return {status: "skipped", reason: "not_opted_in"};
  }

  const rendered = await dependencies.renderEmail({
    template: request.template,
    locale,
    recipientName: facts.displayName,
    variables,
    unsubscribeUrl: unsubscribe?.pageUrl,
    unsubscribeOneClickUrl: unsubscribe?.oneClickUrl,
  });

  const ledger: Ledger = {
    reserve: async () => dependencies.deliveries.reserveEmail(actor, {
      profileId: facts.kind === "member" ? facts.id : null,
      contactId: facts.kind === "contact" ? facts.id : null,
      journeyStateId: null,
      template: request.template,
      subject: rendered.subject,
      idempotencyKey: request.idempotencyKey,
      locale,
      classification,
    }),
    retry: async (id, expectedErrorCode) =>
      dependencies.deliveries.retryEmailFailure(actor, id, expectedErrorCode),
    complete: async (id, completion) =>
      dependencies.deliveries.completeEmail(actor, id, completion),
  };

  const outcome = await settleReservation(ledger, await reserveOrThrow(ledger));
  if (outcome.kind === "settled") return outcome.result;
  const deliveryId = outcome.deliveryId;

  let provider: Awaited<ReturnType<EmailTransport["send"]>>;
  try {
    provider = await dependencies.emailTransport.send({
      to,
      from: dependencies.emailFrom,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      idempotencyKey: request.idempotencyKey,
    });
  } catch (error) {
    const errorCode = providerFailureCodeFrom(error);
    await completeOrThrow(ledger, deliveryId, {status: "failed", errorCode});
    return {status: "failed", errorCode, deliveryId};
  }

  await completeOrThrow(ledger, deliveryId, {status: "sent", providerId: provider.providerId});
  return {status: "sent", providerId: provider.providerId, deliveryId};
}

/**
 * Constructed on demand, never at module scope: `createConfiguredEmailTransport`
 * reads `emailEnv()`, which throws in production without `RESEND_API_KEY` and
 * `EMAIL_FROM`, and a module-scope construction would make that a boot-time
 * coupling for every page that imports this module transitively.
 *
 * `RUN_LIVE_WOZTELL` is passed for the reason S-13 records as an incident: an
 * outbound path that omitted it found no live credentials, answered
 * `{status: "sent", providerId: "mock:…"}` for everything, and recorded journey
 * and dunning messages as delivered while nothing left the building.
 */
export function createProductionNotificationDependencies(): NotificationDispatchDependencies {
  const ai = aiEnv();
  return {
    eligibility: messageEligibilityRepository,
    deliveries: deliveriesRepository,
    templates: whatsappTemplatesRepository,
    emailTransport: createConfiguredEmailTransport(),
    whatsappTransport: createWoztellAdapter({
      ...(ai.woztellApiToken === undefined ? {} : {WOZTELL_API_TOKEN: ai.woztellApiToken}),
      ...(ai.woztellChannelId === undefined ? {} : {WOZTELL_CHANNEL_ID: ai.woztellChannelId}),
      ...(ai.woztellWebhookSecret === undefined
        ? {}
        : {WOZTELL_WEBHOOK_SECRET: ai.woztellWebhookSecret}),
      // C-9 (O-8): the parsed contract. `aiEnv()` accepts only "0" or "1", so a
      // typo is a startup error and not a blast recorded as delivered.
      RUN_LIVE_WOZTELL: ai.runLiveWoztell,
    }),
    renderEmail: renderEmailFn,
    unsubscribeUrls: unsubscribeUrlsFn,
    emailFrom: emailEnv().emailFrom,
  };
}

/**
 * The order is `factsFor` → `classifyRecipient` → the approved-template gate →
 * reserve → send → complete, and it is not rearrangeable: every step before the
 * reservation must be able to refuse WITHOUT writing a log row, so that a
 * suppressed recipient leaves no trace of an attempt that never happened.
 */
export async function dispatchNotification(
  actor: DispatchActor,
  request: NotificationRequest,
  dependencies: NotificationDispatchDependencies = createProductionNotificationDependencies(),
): Promise<NotificationResult> {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new Error("INVALID_NOTIFICATION_REQUEST");
  const notification = parsed.data;

  const facts = await dependencies.eligibility.factsFor(actor, notification.recipient);
  if (facts === null) return {status: "skipped", reason: "unknown_recipient"};

  const category = classifyRecipient(facts, notification.channel);
  if (category !== "eligible") return {status: "skipped", reason: category};

  // The caller's locale wins when it has one — a campaign addresses a segment in
  // the language it was written in — and the recipient's own is the fallback.
  const locale: AppLocale = notification.locale ?? facts.locale;

  return notification.channel === "whatsapp"
    ? await dispatchWhatsApp(actor, notification, facts, locale, dependencies)
    : await dispatchEmail(actor, notification, facts, locale, dependencies);
}
