import "server-only";

import {classifyDeliveryFailure} from "@/lib/automation/retry";
import type {
  RunnerInput,
  RunnerSummary,
} from "@/lib/automation/journey-runner";
import {
  automationCronActor,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import type {EmailReservationInput} from "@/lib/db/repos/deliveries";
import type {
  StaffTaskInput,
  StaffTasksRepository,
} from "@/lib/db/repos/staff-tasks";
import type {EmailSendInput, EmailTransport, DeliveryFailureCode} from "@/lib/email/transport";
import {renderEmail, type RenderedEmail} from "@/lib/email/render";
import type {AppLocale} from "@/i18n/routing";

const LEASE_MS = 5 * 60_000;
const runnerActor = automationCronActor();
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

type CampaignRecipientMutations = Readonly<{
  claimRecipients: (
    actor: AutomationCronActor,
    now: Date,
    limit: number,
    leaseMs: number,
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
    task: StaffTaskInput,
  ) => Promise<Readonly<{
    record: unknown;
    taskDisposition: "created" | "existing";
  }>>;
  completeCampaignIfIdle: (
    actor: AutomationCronActor,
    campaignId: string,
  ) => Promise<boolean>;
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

async function settleFailure(
  dependencies: CampaignRunnerDependencies,
  claim: CampaignRecipientClaim,
  code: DeliveryFailureCode,
  now: Date,
  summary: MutableSummary,
): Promise<void> {
  const decision = classifyDeliveryFailure(retryStatus(code), claim.attemptCount);
  if (decision.action === "retry") {
    await dependencies.campaigns.rescheduleRecipient(
      runnerActor,
      claim.id,
      claim.claimedAt,
      new Date(now.getTime() + decision.delayMinutes * 60_000),
      decision.code,
    );
    summary.retried += 1;
    return;
  }
  const settlement = await dependencies.campaigns.markRecipientFailed(
    runnerActor,
    claim.id,
    claim.claimedAt,
    decision.code,
    {
      profileId: claim.profileId,
      journeyStateId: null,
      kind: "permanent_campaign_delivery_failure",
      dedupeKey: `${campaignDeliveryKey(claim)}:permanent_delivery_failure`,
      summaryCode: decision.code,
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
    await settleFailure(dependencies, claim, "retryable_network", now, summary);
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
    await settleFailure(dependencies, claim, failureCode(error), now, summary);
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
    await dependencies.campaigns.completeCampaignIfIdle(runnerActor, campaignId);
  }
  return summary;
}
