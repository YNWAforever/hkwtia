import "server-only";

import {JOURNEYS} from "@/config/journeys";
import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {evaluateStep, shouldCreateStaffTask} from "@/lib/automation/conditions";
import {classifyDeliveryFailure} from "@/lib/automation/retry";
import {scheduleJourney} from "@/lib/automation/schedule";
import type {
  JourneyContext,
  JourneyName,
  JourneyStep,
  ScheduledJourneyStep,
} from "@/lib/automation/types";
import {
  automationCronActor,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import type {ChannelAdapter} from "@/lib/channels/types";
import type {
  DeliveryCompletion,
  EmailReservationInput,
  WhatsappReservationInput,
} from "@/lib/db/repos/deliveries";
import type {JourneyClaim, JourneysRepository} from "@/lib/db/repos/journeys";
import type {
  StaffTaskInput,
  StaffTasksRepository,
} from "@/lib/db/repos/staff-tasks";
import type {JourneyState} from "@/lib/db/server-schema";
import {
  EMAIL_TEMPLATE_IDS,
  type EmailTemplateId,
  type EmailVariables,
} from "@/lib/email/catalog";
import type {
  EmailTransport,
  DeliveryFailureCode,
} from "@/lib/email/transport";
import type {
  RenderEmailInput,
  RenderedEmail,
} from "@/lib/email/render";
import type {AppLocale} from "@/i18n/routing";
import type {MembershipStatus} from "@/lib/membership/lifecycle";

const LEASE_MS = 5 * 60_000;
const emailTemplates = new Set<string>(EMAIL_TEMPLATE_IDS);
const runnerActor = automationCronActor();
const providerFailureCodes = new Set<DeliveryFailureCode>([
  "retryable_network",
  "retryable_rate_limit",
  "retryable_server",
  "provider_client_error",
  "provider_unclassified_failure",
]);

export type RunnerSummary = Readonly<{
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  stale: number;
  tasksCreated: number;
}>;

export type JourneyRunnerContext = JourneyContext & Readonly<{
  email: string | null;
  recipientName: string;
  locale: AppLocale;
  variables: EmailVariables;
  unsubscribeUrl: string | null;
  membershipStatus: MembershipStatus | null;
}>;

export type DunningLapseDisposition = Readonly<{
  disposition: "lapsed" | "existing" | "resolved";
  createdTasks: number;
  createdSteps: number;
}>;

export type DunningLapseInput = Readonly<{
  membershipId: string;
  profileId: string;
  journeyStateId: string;
  instanceKey: string;
  executedAt: Date;
  winbackSteps: readonly ScheduledJourneyStep[];
}>;

type JourneyTransitions = Pick<
  JourneysRepository,
  "claimDue" | "markSent" | "markSkipped" | "reschedule" | "markFailed"
>;

type RunnerDeliveryRecord = Readonly<{
  id: string;
  status: "processing" | "sent" | "failed";
  idempotencyKey: string;
  providerId?: string | null;
  errorCode?: string | null;
  attemptCount: number;
}>;

type RunnerDeliveryReservation = Readonly<{
  record: RunnerDeliveryRecord;
  disposition: "created" | "existing";
}>;

type DeliveryMutations = Readonly<{
  reserveEmail: (
    actor: AutomationCronActor,
    input: EmailReservationInput,
  ) => Promise<RunnerDeliveryReservation>;
  retryEmailFailure: (
    actor: AutomationCronActor,
    id: string,
    expectedErrorCode: string,
  ) => Promise<RunnerDeliveryRecord>;
  completeEmail: (
    actor: AutomationCronActor,
    id: string,
    completion: DeliveryCompletion,
  ) => Promise<RunnerDeliveryRecord>;
  reserveWhatsapp: (
    actor: AutomationCronActor,
    input: WhatsappReservationInput,
  ) => Promise<RunnerDeliveryReservation>;
  retryWhatsappFailure: (
    actor: AutomationCronActor,
    id: string,
    expectedErrorCode: string,
  ) => Promise<RunnerDeliveryRecord>;
  completeWhatsapp: (
    actor: AutomationCronActor,
    id: string,
    completion: DeliveryCompletion,
  ) => Promise<RunnerDeliveryRecord>;
}>;

type TaskCreator = Pick<StaffTasksRepository, "createOnce">;

export type JourneyRunnerDependencies = Readonly<{
  journeys: JourneyTransitions;
  deliveries: DeliveryMutations;
  staffTasks: TaskCreator;
  memberships: Readonly<{
    lapseDunningEpisode: (
      actor: AutomationCronActor,
      input: DunningLapseInput,
    ) => Promise<DunningLapseDisposition>;
  }>;
  loadContext: (
    actor: AutomationCronActor,
    claim: JourneyClaim,
  ) => Promise<JourneyRunnerContext>;
  renderEmail: (input: RenderEmailInput) => Promise<RenderedEmail>;
  emailTransport: EmailTransport;
  whatsappTransport: Pick<ChannelAdapter, "sendTemplateMessage">;
  emailFrom: string;
}>;

export type RunnerInput = Readonly<{
  now: Date;
  limit: number;
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

class RunnerFailure extends Error {
  constructor(readonly code: DeliveryFailureCode) {
    super(code);
    this.name = "RunnerFailure";
  }
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function stepFor(claim: JourneyState): JourneyStep | null {
  const journey = JOURNEYS[claim.journey as JourneyName];
  return journey?.find((step) => step.key === claim.step) ?? null;
}

function emailTemplate(template: string): EmailTemplateId {
  if (!emailTemplates.has(template)) throw new RunnerFailure("provider_unclassified_failure");
  return template as EmailTemplateId;
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

function persistedFailureCode(
  delivery: RunnerDeliveryRecord,
): DeliveryFailureCode {
  const code = delivery.errorCode;
  return code !== null
    && code !== undefined
    && providerFailureCodes.has(code as DeliveryFailureCode)
    ? code as DeliveryFailureCode
    : "provider_unclassified_failure";
}

function shouldReplayPersistedFailure(
  claim: JourneyClaim,
  delivery: RunnerDeliveryRecord,
  code: DeliveryFailureCode,
): boolean {
  return code === "provider_client_error"
    || code === "provider_unclassified_failure"
    || (
      claim.claimSource === "stale"
      && claim.attemptCount === delivery.attemptCount + 1
    );
}

function claimToken(claim: JourneyState): Date {
  if (!claim.claimedAt || !isValidDate(claim.claimedAt)) throw new Error("MISSING_CLAIM_TOKEN");
  return claim.claimedAt;
}

function isTransitionError(error: unknown): boolean {
  return error instanceof Error
    && (
      error.message === "INVALID_TRANSITION"
      || error.message === "MISSING_CLAIM_TOKEN"
    );
}

async function createTask(
  dependencies: JourneyRunnerDependencies,
  input: StaffTaskInput,
  summary: MutableSummary,
): Promise<void> {
  const result = await dependencies.staffTasks.createOnce(runnerActor, input);
  if (result.disposition === "created") summary.tasksCreated += 1;
}

async function settleFailure(
  dependencies: JourneyRunnerDependencies,
  claim: JourneyClaim,
  code: DeliveryFailureCode,
  now: Date,
  summary: MutableSummary,
): Promise<void> {
  const token = claimToken(claim);
  const decision = classifyDeliveryFailure(retryStatus(code), claim.attemptCount);
  if (decision.action === "retry") {
    const retryAt = new Date(now.getTime() + decision.delayMinutes * 60_000);
    await dependencies.journeys.reschedule(
      runnerActor,
      claim.id,
      token,
      retryAt,
      decision.code,
    );
    summary.retried += 1;
    return;
  }

  const settlement = await dependencies.journeys.markFailed(
    runnerActor,
    claim.id,
    token,
    decision.code,
    now,
    {
      profileId: claim.profileId,
      journeyStateId: claim.id,
      kind: "permanent_delivery_failure",
      dedupeKey: `${claim.deliveryKey}:permanent_delivery_failure`,
      summaryCode: decision.code,
    },
  );
  if (settlement.taskDisposition === "created") summary.tasksCreated += 1;
  summary.failed += 1;
}

async function completeFailedEmail(
  dependencies: JourneyRunnerDependencies,
  delivery: RunnerDeliveryRecord,
  code: DeliveryFailureCode,
): Promise<never> {
  try {
    await dependencies.deliveries.completeEmail(runnerActor, delivery.id, {
      status: "failed",
      errorCode: code,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  throw new RunnerFailure(code);
}

async function sendEmail(
  dependencies: JourneyRunnerDependencies,
  claim: JourneyClaim,
  step: JourneyStep,
  context: JourneyRunnerContext,
): Promise<boolean> {
  const email = context.email?.trim();
  const eligible = Boolean(email)
    && (
      step.classification === "transactional"
      || !context.emailSuppressed
    );
  if (!step.channels.includes("email") || !eligible) return false;

  let rendered: RenderedEmail;
  try {
    rendered = await dependencies.renderEmail({
      template: emailTemplate(step.template),
      locale: context.locale,
      recipientName: context.recipientName,
      variables: context.variables,
      classification: step.classification,
      unsubscribeUrl: context.unsubscribeUrl ?? undefined,
    });
  } catch (error) {
    throw new RunnerFailure(failureCode(error));
  }

  let reservation: Awaited<ReturnType<DeliveryMutations["reserveEmail"]>>;
  try {
    reservation = await dependencies.deliveries.reserveEmail(runnerActor, {
      profileId: claim.profileId,
      journeyStateId: claim.id,
      template: step.template,
      subject: rendered.subject,
      idempotencyKey: claim.deliveryKey,
      locale: context.locale,
      classification: step.classification,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  let delivery = reservation.record;
  if (delivery.status === "sent") return true;
  if (delivery.status === "failed") {
    const code = persistedFailureCode(delivery);
    if (
      shouldReplayPersistedFailure(claim, delivery, code)
    ) {
      throw new RunnerFailure(code);
    }
    try {
      delivery = await dependencies.deliveries.retryEmailFailure(
        runnerActor,
        delivery.id,
        code,
      );
    } catch {
      throw new RunnerFailure("retryable_network");
    }
  }

  let provider;
  try {
    provider = await dependencies.emailTransport.send({
      to: email as string,
      from: dependencies.emailFrom,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      idempotencyKey: claim.deliveryKey,
    });
  } catch (error) {
    return completeFailedEmail(dependencies, delivery, failureCode(error));
  }

  try {
    await dependencies.deliveries.completeEmail(runnerActor, delivery.id, {
      status: "sent",
      providerId: provider.providerId,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  return true;
}

function whatsappVariables(
  variables: EmailVariables,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [key, String(value)]),
  );
}

function whatsappTemplate(step: JourneyStep): WhatsAppTemplateKey | null {
  return Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, step.template)
    ? step.template as WhatsAppTemplateKey
    : null;
}

async function completeFailedWhatsapp(
  dependencies: JourneyRunnerDependencies,
  delivery: RunnerDeliveryRecord,
  code: DeliveryFailureCode,
): Promise<never> {
  try {
    await dependencies.deliveries.completeWhatsapp(runnerActor, delivery.id, {
      status: "failed",
      errorCode: code,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  throw new RunnerFailure(code);
}

async function sendWhatsapp(
  dependencies: JourneyRunnerDependencies,
  claim: JourneyClaim,
  step: JourneyStep,
  context: JourneyRunnerContext,
): Promise<boolean> {
  const template = whatsappTemplate(step);
  const whatsappNumber = context.whatsappNumber?.trim();
  if (
    !step.channels.includes("whatsapp")
    || !template
    || !context.whatsappOptIn
    || !whatsappNumber
  ) {
    return false;
  }

  const idempotencyKey = `${claim.deliveryKey}:whatsapp`;
  let reservation: Awaited<ReturnType<DeliveryMutations["reserveWhatsapp"]>>;
  try {
    reservation = await dependencies.deliveries.reserveWhatsapp(runnerActor, {
      profileId: claim.profileId,
      journeyStateId: claim.id,
      template,
      idempotencyKey,
      locale: context.locale,
      classification: step.classification,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  let delivery = reservation.record;
  if (delivery.status === "sent") return true;
  if (delivery.status === "failed") {
    const code = persistedFailureCode(delivery);
    if (
      shouldReplayPersistedFailure(claim, delivery, code)
    ) {
      throw new RunnerFailure(code);
    }
    try {
      delivery = await dependencies.deliveries.retryWhatsappFailure(
        runnerActor,
        delivery.id,
        code,
      );
    } catch {
      throw new RunnerFailure("retryable_network");
    }
  }

  let provider;
  try {
    provider = await dependencies.whatsappTransport.sendTemplateMessage({
      whatsappOptIn: context.whatsappOptIn,
      whatsappNumber,
      template,
      variables: whatsappVariables(context.variables),
      idempotencyKey,
    });
  } catch (error) {
    return completeFailedWhatsapp(
      dependencies,
      delivery,
      failureCode(error),
    );
  }
  if (provider.status === "skipped") {
    return completeFailedWhatsapp(
      dependencies,
      delivery,
      "provider_unclassified_failure",
    );
  }

  try {
    await dependencies.deliveries.completeWhatsapp(runnerActor, delivery.id, {
      status: "sent",
      providerId: provider.providerId,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  return true;
}

async function lapseDunning(
  dependencies: JourneyRunnerDependencies,
  claim: JourneyClaim,
  summary: MutableSummary,
): Promise<"deliver" | "resolved"> {
  if (claim.journey !== "dunning" || claim.step !== "lapsed") return "deliver";
  if (!claim.membershipId) throw new RunnerFailure("provider_unclassified_failure");
  const instanceKey = `termination:lapse:${claim.id}`;
  const winbackSteps = scheduleJourney({
    journey: "winback",
    profileId: claim.profileId,
    membershipId: claim.membershipId,
    instanceKey,
    anchor: claim.scheduledAt,
  });
  let result: DunningLapseDisposition;
  try {
    result = await dependencies.memberships.lapseDunningEpisode(runnerActor, {
      membershipId: claim.membershipId,
      profileId: claim.profileId,
      journeyStateId: claim.id,
      instanceKey,
      executedAt: claim.scheduledAt,
      winbackSteps,
    });
  } catch {
    throw new RunnerFailure("retryable_network");
  }
  summary.tasksCreated += result.createdTasks;
  return result.disposition === "resolved" ? "resolved" : "deliver";
}

async function processClaim(
  dependencies: JourneyRunnerDependencies,
  claim: JourneyClaim,
  input: RunnerInput,
  summary: MutableSummary,
): Promise<void> {
  const token = claimToken(claim);
  const step = stepFor(claim);
  if (!step) {
    await settleFailure(
      dependencies,
      claim,
      "provider_unclassified_failure",
      input.now,
      summary,
    );
    return;
  }

  let context: JourneyRunnerContext;
  try {
    context = await dependencies.loadContext(runnerActor, claim);
  } catch {
    await settleFailure(
      dependencies,
      claim,
      "retryable_network",
      input.now,
      summary,
    );
    return;
  }

  const decision = evaluateStep(step, context);
  if (decision !== "send") {
    await dependencies.journeys.markSkipped(
      runnerActor,
      claim.id,
      token,
      decision,
      input.now,
    );
    summary.skipped += 1;
    return;
  }

  if (shouldCreateStaffTask(step.key, context)) {
    try {
      await createTask(dependencies, {
        profileId: claim.profileId,
        journeyStateId: claim.id,
        kind: "d90_low_engagement",
        dedupeKey: `${claim.deliveryKey}:d90_low_engagement`,
        summaryCode: "score_below_20",
      }, summary);
    } catch {
      await settleFailure(
        dependencies,
        claim,
        "retryable_network",
        input.now,
        summary,
      );
      return;
    }
  }

  try {
    if (await lapseDunning(dependencies, claim, summary) === "resolved") {
      await dependencies.journeys.markSkipped(
        runnerActor,
        claim.id,
        token,
        "dunning_resolved",
        input.now,
      );
      summary.skipped += 1;
      return;
    }

    const emailSent = await sendEmail(dependencies, claim, step, context);
    const whatsappSent = await sendWhatsapp(dependencies, claim, step, context);
    if (!emailSent && !whatsappSent) {
      await dependencies.journeys.markSkipped(
        runnerActor,
        claim.id,
        token,
        "recipient_ineligible",
        input.now,
      );
      summary.skipped += 1;
      return;
    }
    await dependencies.journeys.markSent(
      runnerActor,
      claim.id,
      token,
      input.now,
    );
    summary.sent += 1;
  } catch (error) {
    if (isTransitionError(error)) throw error;
    await settleFailure(
      dependencies,
      claim,
      failureCode(error),
      input.now,
      summary,
    );
  }
}

export async function runJourneyBatch(
  dependencies: JourneyRunnerDependencies,
  input: RunnerInput,
): Promise<RunnerSummary> {
  if (
    !isValidDate(input.now)
    || !Number.isInteger(input.limit)
    || input.limit <= 0
  ) {
    throw new Error("INVALID_RUNNER_INPUT");
  }
  const claims = await dependencies.journeys.claimDue(
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

  for (const claim of claims) {
    try {
      await processClaim(dependencies, claim, input, summary);
    } catch (error) {
      if (!isTransitionError(error)) throw error;
      summary.stale += 1;
    }
  }
  return summary;
}
