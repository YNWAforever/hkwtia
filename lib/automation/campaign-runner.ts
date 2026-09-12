import "server-only";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {classifyDeliveryFailure} from "@/lib/automation/retry";
import type {
  RunnerInput,
  RunnerSummary,
} from "@/lib/automation/journey-runner";
import {
  automationCronActor,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import type {
  CampaignPromotionResult,
  CampaignSendChannel,
  CampaignStaffTask,
  WhatsAppRecipientClaim,
} from "@/lib/db/repos/campaign-recipient-delivery";
import {
  notificationActor,
  type EmailReservationInput,
  type NotificationActor,
} from "@/lib/db/repos/deliveries";
import type {
  StaffTasksRepository,
} from "@/lib/db/repos/staff-tasks";
import type {
  NotificationRequest,
  NotificationResult,
} from "@/lib/notifications/dispatch";
import type {EmailSendInput, EmailTransport, DeliveryFailureCode} from "@/lib/email/transport";
import {renderEmail, type RenderedEmail} from "@/lib/email/render";
import type {AppLocale} from "@/i18n/routing";

const LEASE_MS = 5 * 60_000;
/**
 * D-10. Twenty per ten-minute tick is 120 an hour, and the pacing comes from the
 * cron rather than from a sleep inside the request: a job route that slept would
 * hold a Vercel invocation open and still lose the batch to
 * `QUEUE_REQUEST_TIMEOUT_MS`.
 */
export const WHATSAPP_QUEUE_BATCH_LIMIT = 20;
const runnerActor = automationCronActor();
/**
 * The dispatcher's principal, not the cron's. `requireDeliveryActor` admits
 * both, but the delivery log records which one wrote the row, and "the campaign
 * send queue" is a more useful answer than "the automation cron" when a member
 * asks why they received something.
 */
const campaignNotificationActor: NotificationActor = notificationActor("campaign");
const providerFailureCodes = new Set<DeliveryFailureCode>([
  "retryable_network",
  "retryable_rate_limit",
  "retryable_server",
  "provider_client_error",
  "provider_unclassified_failure",
]);

const campaignTemplateMap = {
  "renewal-reminder": "campaign_generic",
  "member-update": "campaign_generic",
  "membership_renewal": "campaign_generic",
} as const;
type CampaignSourceTemplate = keyof typeof campaignTemplateMap;

export type CampaignRecipientClaim = Readonly<{
  id: string;
  campaignId: string;
  profileId: string;
  email: string;
  locale: AppLocale;
  variables: Readonly<Record<string, string>>;
  template: string;
  status: "queued" | "processing" | "sent" | "failed" | "suppressed";
  attemptCount: number;
  claimedAt: Date;
  claimExpiresAt: Date | null;
  errorCode: string | null;
  claimSource: "queued" | "retry" | "stale";
}>;

export type CampaignRecipientContext = Readonly<{
  marketingConsent: boolean;
  emailSuppressed: boolean;
  unsubscribeUrl: string;
  unsubscribeOneClickUrl: string;
}>;

export type CampaignRenderInput = Readonly<{
  sourceTemplate: CampaignSourceTemplate;
  template: "campaign_generic";
  locale: AppLocale;
  variables: Readonly<Record<string, string>>;
  unsubscribeUrl: string;
  unsubscribeOneClickUrl: string;
}>;

type DeliveryRecordLike = Readonly<{
  id: string;
  status: "processing" | "sent" | "failed";
  idempotencyKey: string;
  providerId?: string | null;
  errorCode?: string | null;
  attemptCount: number;
}>;

type DeliveryRetryResultLike = Readonly<{
  record: DeliveryRecordLike;
  failureCode: DeliveryFailureCode;
}>;

type EmailDeliveries = Readonly<{
  reserveEmail: (
    actor: AutomationCronActor,
    input: EmailReservationInput,
  ) => Promise<Readonly<{
    record: DeliveryRecordLike;
    disposition: "created" | "existing";
  }>>;
  retryEmailFailure: (
    actor: AutomationCronActor,
    id: string,
    expectedErrorCode: string,
  ) => Promise<DeliveryRetryResultLike>;
  completeEmail: (
    actor: AutomationCronActor,
    id: string,
    completion:
      | Readonly<{status: "sent"; providerId: string}>
      | Readonly<{status: "failed"; errorCode: string; providerId?: null}>,
  ) => Promise<DeliveryRecordLike>;
}>;

/**
 * The transitions both lanes share. Split out of `CampaignRecipientMutations`
 * so `settleFailure` — one retry-or-permanent decision, one staff task, one
 * spelling of "attempts exhausted" — serves the email batch and the WhatsApp
 * batch without either of them owning a copy of it.
 */
type CampaignFailureMutations = Readonly<{
  rescheduleRecipient: (
    actor: AutomationCronActor,
    id: string,
    claimedAt: Date,
    retryAt: Date,
    errorCode: string,
  ) => Promise<unknown>;
  markRecipientFailed: (
    actor: AutomationCronActor,
    id: string,
    claimedAt: Date,
    errorCode: string,
    task: CampaignStaffTask,
  ) => Promise<Readonly<{
    record: unknown;
    taskDisposition: "created" | "existing";
  }>>;
}>;

type CampaignCompletion = Readonly<{
  completeCampaignIfIdle: (
    actor: AutomationCronActor,
    campaignId: string,
    now: Date,
  ) => Promise<boolean>;
}>;

type CampaignRecipientMutations = CampaignFailureMutations & CampaignCompletion & Readonly<{
  claimRecipients: (
    actor: AutomationCronActor,
    now: Date,
    limit: number,
    leaseMs: number,
    channel: "email",
  ) => Promise<CampaignRecipientClaim[]>;
  markRecipientSent: (
    actor: AutomationCronActor,
    id: string,
    claimedAt: Date,
  ) => Promise<unknown>;
  markRecipientSuppressed: (
    actor: AutomationCronActor,
    id: string,
    claimedAt: Date,
    errorCode: string,
  ) => Promise<unknown>;
}>;

type WhatsAppRecipientMutations = CampaignFailureMutations & CampaignCompletion & Readonly<{
  promoteScheduledCampaigns: (
    actor: AutomationCronActor,
    now: Date,
    channel: CampaignSendChannel,
  ) => Promise<CampaignPromotionResult>;
  claimRecipients: (
    actor: AutomationCronActor,
    now: Date,
    limit: number,
    leaseMs: number,
    channel: "whatsapp",
  ) => Promise<WhatsAppRecipientClaim[]>;
  markRecipientSent: (
    actor: AutomationCronActor,
    id: string,
    claimedAt: Date,
    delivery: Readonly<{providerMessageId: string; sentAt: Date}>,
  ) => Promise<unknown>;
  markRecipientBlocked: (
    actor: AutomationCronActor,
    id: string,
    claimedAt: Date,
    blockedReason: string,
  ) => Promise<unknown>;
}>;

type TaskCreator = Pick<StaffTasksRepository, "createOnce">;

export type CampaignRunnerDependencies = Readonly<{
  campaigns: CampaignRecipientMutations;
  deliveries: EmailDeliveries;
  staffTasks: TaskCreator;
  loadContext: (
    actor: AutomationCronActor,
    profileId: string,
  ) => Promise<CampaignRecipientContext>;
  renderCampaign: (input: CampaignRenderInput) => Promise<RenderedEmail>;
  emailTransport: EmailTransport;
  emailFrom: string;
}>;

type MutableSummary = {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  stale: number;
  tasksCreated: number;
};

class CampaignRunnerFailure extends Error {
  constructor(readonly code: DeliveryFailureCode) {
    super(code);
    this.name = "CampaignRunnerFailure";
  }
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function failureCode(error: unknown): DeliveryFailureCode {
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    && providerFailureCodes.has(error.code as DeliveryFailureCode)
  ) {
    return error.code as DeliveryFailureCode;
  }
  return "provider_unclassified_failure";
}

function campaignTemplateSelection(
  source: string,
): Readonly<{
  sourceTemplate: CampaignSourceTemplate;
  template: (typeof campaignTemplateMap)[CampaignSourceTemplate];
}> {
  if (
    !Object.prototype.hasOwnProperty.call(campaignTemplateMap, source)
  ) {
    throw new CampaignRunnerFailure("provider_unclassified_failure");
  }
  const sourceTemplate = source as CampaignSourceTemplate;
  return {
    sourceTemplate,
    template: campaignTemplateMap[sourceTemplate],
  };
}

function persistedFailureCode(
  delivery: DeliveryRecordLike,
): DeliveryFailureCode {
  const code = delivery.errorCode;
  return code !== null
    && code !== undefined
    && providerFailureCodes.has(code as DeliveryFailureCode)
    ? code as DeliveryFailureCode
    : "provider_unclassified_failure";
}

function shouldReplayPersistedFailure(
  claim: CampaignRecipientClaim,
  delivery: DeliveryRecordLike,
  code: DeliveryFailureCode,
): boolean {
  return code === "provider_client_error"
    || code === "provider_unclassified_failure"
    || (
      claim.claimSource === "stale"
      && claim.attemptCount === delivery.attemptCount + 1
    );
}

function retryStatus(code: DeliveryFailureCode): number | null {
  switch (code) {
    case "retryable_network":
      return null;
    case "retryable_rate_limit":
      return 429;
    case "retryable_server":
      return 500;
    case "provider_client_error":
      return 400;
    case "provider_unclassified_failure":
      return 200;
  }
}

function isTransitionError(error: unknown): boolean {
  return error instanceof Error
    && error.message === "INVALID_CAMPAIGN_RECIPIENT_TRANSITION";
}

export function campaignDeliveryKey(claim: Pick<CampaignRecipientClaim, "campaignId" | "id">): string {
  return `campaign:${claim.campaignId}:${claim.id}:email`;
}

export function createCampaignEmailRenderer(
  ctaUrl: string,
): (input: CampaignRenderInput) => Promise<RenderedEmail> {
  return async (input) => renderEmail({
    template: input.template,
    locale: input.locale,
    recipientName: input.variables.displayName ?? "",
    variables: {
      ...input.variables,
      ctaUrl: input.variables.ctaUrl ?? ctaUrl,
    },
    classification: "marketing",
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeOneClickUrl: input.unsubscribeOneClickUrl,
  });
}

async function completeFailedDelivery(
  dependencies: CampaignRunnerDependencies,
  delivery: DeliveryRecordLike,
  code: DeliveryFailureCode,
): Promise<never> {
  try {
    await dependencies.deliveries.completeEmail(runnerActor, delivery.id, {
      status: "failed",
      errorCode: code,
    });
  } catch {
    throw new CampaignRunnerFailure("retryable_network");
  }
  throw new CampaignRunnerFailure(code);
}

async function sendRecipient(
  dependencies: CampaignRunnerDependencies,
  claim: CampaignRecipientClaim,
  context: CampaignRecipientContext,
): Promise<void> {
  const template = campaignTemplateSelection(claim.template);
  let rendered: RenderedEmail;
  try {
    rendered = await dependencies.renderCampaign({
      sourceTemplate: template.sourceTemplate,
      template: template.template,
      locale: claim.locale,
      variables: claim.variables,
      unsubscribeUrl: context.unsubscribeUrl,
      unsubscribeOneClickUrl: context.unsubscribeOneClickUrl,
    });
  } catch (error) {
    throw new CampaignRunnerFailure(failureCode(error));
  }

  const idempotencyKey = campaignDeliveryKey(claim);
  let reservation: Awaited<ReturnType<EmailDeliveries["reserveEmail"]>>;
  try {
    reservation = await dependencies.deliveries.reserveEmail(runnerActor, {
      profileId: claim.profileId,
      journeyStateId: null,
      template: template.template,
      subject: rendered.subject,
      idempotencyKey,
      locale: claim.locale,
      classification: "marketing",
    });
  } catch {
    throw new CampaignRunnerFailure("retryable_network");
  }
  let delivery = reservation.record;
  if (delivery.status === "sent") return;
  if (delivery.status === "failed") {
    const code = persistedFailureCode(delivery);
    if (
      shouldReplayPersistedFailure(claim, delivery, code)
    ) {
      throw new CampaignRunnerFailure(code);
    }
    let retryResult: DeliveryRetryResultLike;
    try {
      retryResult = await dependencies.deliveries.retryEmailFailure(
        runnerActor,
        delivery.id,
        code,
      );
    } catch {
      throw new CampaignRunnerFailure("retryable_network");
    }
    if (retryResult.failureCode !== code) {
      throw new CampaignRunnerFailure("provider_unclassified_failure");
    }
    delivery = retryResult.record;
  }

  let provider: Awaited<ReturnType<EmailTransport["send"]>>;
  const sendInput: EmailSendInput = {
    to: claim.email,
    from: dependencies.emailFrom,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: rendered.headers,
    idempotencyKey,
  };
  try {
    provider = await dependencies.emailTransport.send(sendInput);
  } catch (error) {
    return completeFailedDelivery(
      dependencies,
      delivery,
      failureCode(error),
    );
  }

  try {
    await dependencies.deliveries.completeEmail(runnerActor, delivery.id, {
      status: "sent",
      providerId: provider.providerId,
    });
  } catch {
    throw new CampaignRunnerFailure("retryable_network");
  }
}

/**
 * The subset of a claim a failure settlement needs, so one implementation
 * serves an email claim (a member, always) and a WhatsApp claim (a member or a
 * prospect, hence the nullable profile).
 */
type SettleableClaim = Readonly<{
  id: string;
  claimedAt: Date;
  attemptCount: number;
  profileId: string | null;
}>;

async function settleFailure(
  mutations: CampaignFailureMutations,
  claim: SettleableClaim,
  deliveryKey: string,
  code: DeliveryFailureCode,
  now: Date,
  summary: MutableSummary,
): Promise<void> {
  const decision = classifyDeliveryFailure(retryStatus(code), claim.attemptCount);
  if (decision.action === "retry") {
    await mutations.rescheduleRecipient(
      runnerActor,
      claim.id,
      claim.claimedAt,
      new Date(now.getTime() + decision.delayMinutes * 60_000),
      decision.code,
    );
    summary.retried += 1;
    return;
  }
  await settlePermanently(mutations, claim, deliveryKey, decision.code, summary);
}

async function settlePermanently(
  mutations: CampaignFailureMutations,
  claim: SettleableClaim,
  deliveryKey: string,
  code: string,
  summary: MutableSummary,
): Promise<void> {
  const settlement = await mutations.markRecipientFailed(
    runnerActor,
    claim.id,
    claim.claimedAt,
    code,
    {
      profileId: claim.profileId,
      journeyStateId: null,
      kind: "permanent_campaign_delivery_failure",
      dedupeKey: `${deliveryKey}:permanent_delivery_failure`,
      summaryCode: code,
    },
  );
  if (settlement.taskDisposition === "created") summary.tasksCreated += 1;
  summary.failed += 1;
}

async function processRecipient(
  dependencies: CampaignRunnerDependencies,
  claim: CampaignRecipientClaim,
  now: Date,
  summary: MutableSummary,
): Promise<void> {
  let context: CampaignRecipientContext;
  try {
    context = await dependencies.loadContext(runnerActor, claim.profileId);
  } catch {
    await settleFailure(dependencies.campaigns, claim, campaignDeliveryKey(claim), "retryable_network", now, summary);
    return;
  }

  if (!context.marketingConsent || context.emailSuppressed) {
    await dependencies.campaigns.markRecipientSuppressed(
      runnerActor,
      claim.id,
      claim.claimedAt,
      "marketing_suppressed",
    );
    summary.skipped += 1;
    return;
  }

  try {
    await sendRecipient(dependencies, claim, context);
    await dependencies.campaigns.markRecipientSent(
      runnerActor,
      claim.id,
      claim.claimedAt,
    );
    summary.sent += 1;
  } catch (error) {
    if (isTransitionError(error)) throw error;
    await settleFailure(dependencies.campaigns, claim, campaignDeliveryKey(claim), failureCode(error), now, summary);
  }
}

export async function runCampaignBatch(
  dependencies: CampaignRunnerDependencies,
  input: RunnerInput,
): Promise<RunnerSummary> {
  if (
    !isValidDate(input.now)
    || !Number.isInteger(input.limit)
    || input.limit <= 0
  ) {
    throw new Error("INVALID_RUNNER_INPUT");
  }
  const claims = await dependencies.campaigns.claimRecipients(
    runnerActor,
    input.now,
    input.limit,
    LEASE_MS,
    // S-11. Explicit, so this loop can never reach a WhatsApp recipient and
    // render a template key through the email catalogue.
    "email",
  );
  const summary: MutableSummary = {
    claimed: claims.length,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    stale: 0,
    tasksCreated: 0,
  };
  const campaigns = new Set<string>();

  for (const claim of claims) {
    campaigns.add(claim.campaignId);
    try {
      await processRecipient(dependencies, claim, input.now, summary);
    } catch (error) {
      if (!isTransitionError(error)) throw error;
      summary.stale += 1;
    }
  }
  for (const campaignId of campaigns) {
    // Phase C2 Task 1 Step 4b: the batch clock, not a database clock, so the
    // completion timestamp matches the claim sweep's and a test can pin it.
    await dependencies.campaigns.completeCampaignIfIdle(
      runnerActor,
      campaignId,
      input.now,
    );
  }
  return summary;
}

/**
 * Programme C-5 / D-10, Phase C2 Task 10 Step 5. The WhatsApp blast lane.
 *
 * It CALLS the notifications dispatcher; it does not re-implement it. The
 * sequence `factsFor → classifyRecipient → approved-template gate → reserve →
 * send → complete` lives in `lib/notifications/dispatch.ts` (Task 11), and the
 * earlier draft that inlined it here would have shipped two WhatsApp send paths
 * built in one phase — with the idempotency-namespace and reservation rules that
 * module spells out governing the one that never runs.
 *
 * The send-time recheck inside the dispatcher IS the "one STOP suppresses that
 * member from the next blast" guarantee: the queue-time snapshot narrows the
 * audience, and `factsFor` catches anyone who opted out between the approval and
 * the tick.
 */
export type WhatsAppCampaignRunnerDependencies = Readonly<{
  campaigns: WhatsAppRecipientMutations;
  /**
   * Injected rather than imported so this module keeps no runtime dependency on
   * the dispatcher's production wiring — which constructs an email transport and
   * a WOZTELL adapter, and would otherwise be constructed once per recipient by
   * `dispatchNotification`'s default argument.
   */
  dispatch: (
    actor: NotificationActor,
    request: NotificationRequest,
  ) => Promise<NotificationResult>;
}>;

export function campaignWhatsAppDeliveryKey(
  claim: Pick<WhatsAppRecipientClaim, "campaignId" | "id">,
): string {
  // `notify:<source>:<digest>`, which `dispatch.ts` enforces with a regex. NOT
  // the `journey:` namespace: `lib/db/repos/journeys.ts` joins
  // `whatsapp_delivery.idempotency_key = source.delivery_key || ':whatsapp'` in
  // both `claimDue` and `retryFailed`, so a foreign key shape there silently
  // disables admin retry and stale-claim replay detection.
  return `notify:campaign:${claim.campaignId}:${claim.id}`;
}

function sendableTemplateKey(key: string): WhatsAppTemplateKey | null {
  return Object.hasOwn(WHATSAPP_TEMPLATES, key) ? key as WhatsAppTemplateKey : null;
}

async function processWhatsAppRecipient(
  dependencies: WhatsAppCampaignRunnerDependencies,
  claim: WhatsAppRecipientClaim,
  now: Date,
  summary: MutableSummary,
): Promise<void> {
  const deliveryKey = campaignWhatsAppDeliveryKey(claim);
  const template = sendableTemplateKey(claim.templateKey);
  if (template === null) {
    // A registry row for a key the code has retired. Blocked, not failed: no
    // attempt was made and no provider was called, and `template_not_approved`
    // is the word the preview and the report already use.
    await dependencies.campaigns.markRecipientBlocked(
      runnerActor,
      claim.id,
      claim.claimedAt,
      "template_not_approved",
    );
    summary.skipped += 1;
    return;
  }

  let result: NotificationResult;
  try {
    result = await dependencies.dispatch(campaignNotificationActor, {
      recipient: claim.recipient,
      channel: "whatsapp",
      template,
      // The SNAPSHOT, resolved per recipient at draft time (Task 8 Step 5) and
      // approved by a second admin — never the template's defaults and never the
      // campaign row's unresolved tokens.
      variables: claim.variables,
      idempotencyKey: deliveryKey,
      locale: claim.locale,
    });
  } catch (error) {
    // `NotificationDispatchFailure` means the LEDGER could not be written, which
    // is a retryable condition; a provider refusal comes back as a result.
    await settleFailure(dependencies.campaigns, claim, deliveryKey, failureCode(error), now, summary);
    return;
  }

  if (result.status === "sent") {
    await dependencies.campaigns.markRecipientSent(runnerActor, claim.id, claim.claimedAt, {
      providerMessageId: result.providerId,
      sentAt: now,
    });
    summary.sent += 1;
    return;
  }

  if (result.status === "skipped") {
    await dependencies.campaigns.markRecipientBlocked(
      runnerActor,
      claim.id,
      claim.claimedAt,
      result.reason,
    );
    summary.skipped += 1;
    return;
  }

  if (result.errorCode === "provider_acceptance_uncertain") {
    // S-15. WOZTELL may already have delivered it, so this attempt is terminal
    // and is never rescheduled: a retry is a second billable marketing message
    // to somebody who has already read the first. A staff task is the only
    // correct next step, and `markRecipientFailed` writes it in the same
    // transaction as the transition.
    await settlePermanently(
      dependencies.campaigns,
      claim,
      deliveryKey,
      "provider_acceptance_uncertain",
      summary,
    );
    return;
  }
  await settleFailure(dependencies.campaigns, claim, deliveryKey, result.errorCode, now, summary);
}

export async function runWhatsAppCampaignBatch(
  dependencies: WhatsAppCampaignRunnerDependencies,
  input: RunnerInput,
): Promise<RunnerSummary & Readonly<{promoted: number; refused: number}>> {
  if (
    !isValidDate(input.now)
    || !Number.isInteger(input.limit)
    || input.limit <= 0
  ) {
    throw new Error("INVALID_RUNNER_INPUT");
  }

  // Step 4c: FIRST, before the claim. The `due` CTE only reaches
  // ('queued', 'processing'), so a campaign the wizard wrote as `scheduled`
  // is invisible to it until this runs — and a queue that claims nothing
  // returns a summary indistinguishable from an empty one.
  const promotion = await dependencies.campaigns.promoteScheduledCampaigns(
    runnerActor,
    input.now,
    "whatsapp",
  );

  const claims = await dependencies.campaigns.claimRecipients(
    runnerActor,
    input.now,
    input.limit,
    LEASE_MS,
    "whatsapp",
  );
  const summary: MutableSummary = {
    claimed: claims.length,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    stale: 0,
    tasksCreated: 0,
  };
  const campaigns = new Set<string>();

  for (const claim of claims) {
    campaigns.add(claim.campaignId);
    try {
      await processWhatsAppRecipient(dependencies, claim, input.now, summary);
    } catch (error) {
      // A lost race for the claim, not a delivery problem: another tick settled
      // this recipient while we were sending. Counted, never retried.
      if (!isTransitionError(error)) throw error;
      summary.stale += 1;
    }
  }
  for (const campaignId of campaigns) {
    await dependencies.campaigns.completeCampaignIfIdle(
      runnerActor,
      campaignId,
      input.now,
    );
  }
  return {
    ...summary,
    promoted: promotion.promoted.length,
    refused: promotion.blocked.length,
  };
}
