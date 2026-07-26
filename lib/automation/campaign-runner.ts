import "server-only";

import {classifyDeliveryFailure} from "@/lib/automation/retry";
import type {
  RunnerInput,
  RunnerSummary,
} from "@/lib/automation/journey-runner";
import {systemActor} from "@/lib/auth/actor";
import type {EmailReservationInput} from "@/lib/db/repos/deliveries";
import type {EmailSendInput, EmailTransport, DeliveryFailureCode} from "@/lib/email/transport";
import {renderEmail, type RenderedEmail} from "@/lib/email/render";
import type {AppLocale} from "@/i18n/routing";
import type {Actor} from "@/lib/membership/lifecycle";

const LEASE_MS = 5 * 60_000;
const runnerActor = systemActor("stripe-webhook");
const providerFailureCodes = new Set<DeliveryFailureCode>([
  "retryable_network",
  "retryable_rate_limit",
  "retryable_server",
  "provider_client_error",
  "provider_unclassified_failure",
]);

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
}>;

export type CampaignRecipientContext = Readonly<{
  marketingConsent: boolean;
  emailSuppressed: boolean;
  unsubscribeUrl: string;
}>;

export type CampaignRenderInput = Readonly<{
  template: string;
  locale: AppLocale;
  variables: Readonly<Record<string, string>>;
  unsubscribeUrl: string;
}>;

type DeliveryRecordLike = Readonly<{
  id: string;
  status: "processing" | "sent" | "failed";
  idempotencyKey: string;
  providerId?: string | null;
  errorCode?: string | null;
}>;

type EmailDeliveries = Readonly<{
  reserveEmail: (
    actor: Actor,
    input: EmailReservationInput,
  ) => Promise<Readonly<{
    record: DeliveryRecordLike;
    disposition: "created" | "existing";
  }>>;
  completeEmail: (
    actor: Actor,
    id: string,
    completion:
      | Readonly<{status: "sent"; providerId: string}>
      | Readonly<{status: "failed"; errorCode: string; providerId?: null}>,
  ) => Promise<DeliveryRecordLike>;
}>;

type CampaignRecipientMutations = Readonly<{
  claimRecipients: (
    actor: Actor,
    now: Date,
    limit: number,
    leaseMs: number,
  ) => Promise<CampaignRecipientClaim[]>;
  markRecipientSent: (
    actor: Actor,
    id: string,
    claimedAt: Date,
  ) => Promise<unknown>;
  markRecipientSuppressed: (
    actor: Actor,
    id: string,
    claimedAt: Date,
    errorCode: string,
  ) => Promise<unknown>;
  rescheduleRecipient: (
    actor: Actor,
    id: string,
    claimedAt: Date,
    retryAt: Date,
    errorCode: string,
  ) => Promise<unknown>;
  markRecipientFailed: (
    actor: Actor,
    id: string,
    claimedAt: Date,
    errorCode: string,
  ) => Promise<unknown>;
  completeCampaignIfIdle: (
    actor: Actor,
    campaignId: string,
  ) => Promise<boolean>;
}>;

export type CampaignRunnerDependencies = Readonly<{
  campaigns: CampaignRecipientMutations;
  deliveries: EmailDeliveries;
  loadContext: (
    actor: Actor,
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
    template: "campaign_generic",
    locale: input.locale,
    recipientName: input.variables.displayName ?? "",
    variables: {
      ...input.variables,
      ctaUrl: input.variables.ctaUrl ?? ctaUrl,
    },
    classification: "marketing",
    unsubscribeUrl: input.unsubscribeUrl,
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
  let rendered: RenderedEmail;
  try {
    rendered = await dependencies.renderCampaign({
      template: claim.template,
      locale: claim.locale,
      variables: claim.variables,
      unsubscribeUrl: context.unsubscribeUrl,
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
      template: claim.template,
      subject: rendered.subject,
      idempotencyKey,
      locale: claim.locale,
      classification: "marketing",
    });
  } catch {
    throw new CampaignRunnerFailure("retryable_network");
  }
  if (reservation.record.status === "sent") return;

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
      reservation.record,
      failureCode(error),
    );
  }

  try {
    await dependencies.deliveries.completeEmail(runnerActor, reservation.record.id, {
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
  await dependencies.campaigns.markRecipientFailed(
    runnerActor,
    claim.id,
    claim.claimedAt,
    decision.code,
  );
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
