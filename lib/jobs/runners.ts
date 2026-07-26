import "server-only";

import {createHash} from "node:crypto";

import {z} from "zod";

import {
  createCampaignEmailRenderer,
  runCampaignBatch,
} from "@/lib/automation/campaign-runner";
import {expireStaleApprovals} from "@/lib/automation/approvals-expirer";
import {recomputeEngagementScores} from "@/lib/automation/engagement-score-runner";
import {runJourneyBatch} from "@/lib/automation/journey-runner";
import {runRenewalReconciliation} from "@/lib/automation/renewal-runner";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {serverEnv} from "@/lib/config/env";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import {deliveriesRepository} from "@/lib/db/repos/deliveries";
import {dunningLapseRepository} from "@/lib/db/repos/dunning-lapse";
import {jobRunnerContextRepository} from "@/lib/db/repos/job-runner-context";
import {journeysRepository} from "@/lib/db/repos/journeys";
import {
  staffAlertRecipientsRepository,
  type StaffAlertRecipientsRepository,
} from "@/lib/db/repos/staff-alert-recipients";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {renderEmail, type RenderedEmail} from "@/lib/email/render";
import {
  createConfiguredResendTransport,
  type EmailTransport,
} from "@/lib/email/transport";
import {signUnsubscribeToken} from "@/lib/email/unsubscribe-token";
import {JobRequestError, type PreparedJob} from "@/lib/jobs/handler";

const MAX_WORKER_ALERT_BYTES = 4_096;
const RUNNER_BATCH_LIMIT = 100;
const UNSUBSCRIBE_TTL_SECONDS = 30 * 24 * 60 * 60;

const workerAlertSchema = z.object({
  job: z.enum([
    "journey-runner",
    "renewal-runner",
    "engagement-score",
    "approvals-expirer",
  ]),
  scheduledTime: z.string().min(1).max(64),
  attemptCount: z.number().int().min(1).max(3),
  errorCode: z.enum([
    "JOB_HTTP_ERROR",
    "JOB_NETWORK_ERROR",
    "JOB_TIMEOUT",
  ]),
}).strict();

export type WorkerAlertPayload = Readonly<{
  job:
    | "journey-runner"
    | "renewal-runner"
    | "engagement-score"
    | "approvals-expirer";
  scheduledTime: string;
  attemptCount: number;
  errorCode: "JOB_HTTP_ERROR" | "JOB_NETWORK_ERROR" | "JOB_TIMEOUT";
}>;

type WorkerAlertDependencies = Readonly<{
  recipients?: StaffAlertRecipientsRepository;
  render?: (payload: WorkerAlertPayload) => Promise<RenderedEmail>;
  transport?: EmailTransport;
  emailFrom?: string;
}>;

type ProductionRunnerOverrides = Partial<Readonly<{
  runJourneys(now: Date): Promise<unknown>;
  runCampaigns(now: Date): Promise<unknown>;
  runRenewal(now: Date): Promise<unknown>;
  runEngagement(now: Date): Promise<unknown>;
  runApprovals(now: Date): Promise<unknown>;
  runWorkerAlert(payload: WorkerAlertPayload): Promise<unknown>;
}>>;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalWorkerAlert(payload: WorkerAlertPayload): string {
  return JSON.stringify({
    job: payload.job,
    scheduledTime: payload.scheduledTime,
    attemptCount: payload.attemptCount,
    errorCode: payload.errorCode,
  });
}

function workerAlertDigest(payload: WorkerAlertPayload): string {
  return digest(canonicalWorkerAlert(payload));
}

function contentTypeIsJson(request: Request): boolean {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return mediaType === "application/json";
}

async function boundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const bytes = Number(contentLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new JobRequestError(400, "INVALID_WORKER_ALERT");
    }
    if (bytes > MAX_WORKER_ALERT_BYTES) {
      throw new JobRequestError(413, "WORKER_ALERT_TOO_LARGE");
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > MAX_WORKER_ALERT_BYTES) {
      await reader.cancel();
      throw new JobRequestError(413, "WORKER_ALERT_TOO_LARGE");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch {
    throw new JobRequestError(400, "INVALID_WORKER_ALERT");
  }
}

export async function prepareWorkerAlertRequest(
  request: Request,
): Promise<PreparedJob<WorkerAlertPayload>> {
  if (!contentTypeIsJson(request)) {
    throw new JobRequestError(415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const body = await boundedBody(request);
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    throw new JobRequestError(400, "INVALID_WORKER_ALERT");
  }
  const parsed = workerAlertSchema.safeParse(input);
  if (!parsed.success) {
    throw new JobRequestError(400, "INVALID_WORKER_ALERT");
  }
  const scheduledTime = new Date(parsed.data.scheduledTime);
  if (!Number.isFinite(scheduledTime.getTime())) {
    throw new JobRequestError(400, "INVALID_WORKER_ALERT");
  }
  const value: WorkerAlertPayload = {
    ...parsed.data,
    scheduledTime: scheduledTime.toISOString(),
  };
  return {
    value,
    runKey: `worker-alert:${workerAlertDigest(value)}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderWorkerAlert(
  payload: WorkerAlertPayload,
): Promise<RenderedEmail> {
  const subject = "WTIA automation alert";
  const details = [
    ["Job", payload.job],
    ["Scheduled time", payload.scheduledTime],
    ["Attempts", String(payload.attemptCount)],
    ["Error code", payload.errorCode],
  ] as const;
  const rows = details
    .map(([label, value]) => (
      `<tr><th align="left" style="padding:8px 12px;color:#475569">${escapeHtml(label)}</th>`
      + `<td style="padding:8px 12px;color:#0f172a">${escapeHtml(value)}</td></tr>`
    ))
    .join("");
  const text = [
    subject,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    "Review the automation dashboard before retrying manually.",
  ].join("\n");
  return {
    subject,
    html: [
      '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif">',
      '<main style="max-width:640px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e2e8f0">',
      '<p style="color:#2563eb;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">WTIA</p>',
      `<h1 style="color:#0f172a">${subject}</h1>`,
      '<p style="color:#475569">A scheduled automation did not succeed after its bounded retries.</p>',
      `<table role="presentation" style="border-collapse:collapse;width:100%">${rows}</table>`,
      '<p style="color:#475569">Review the automation dashboard before retrying manually.</p>',
      "</main></body></html>",
    ].join(""),
    text,
    headers: {},
  };
}

export async function sendWorkerAlert(
  payload: WorkerAlertPayload,
  dependencies: WorkerAlertDependencies = {},
): Promise<Readonly<{recipients: number; sent: number; failed: number}>> {
  const recipients =
    dependencies.recipients ?? staffAlertRecipientsRepository;
  const render = dependencies.render ?? renderWorkerAlert;
  const transport =
    dependencies.transport ?? createConfiguredResendTransport();
  const emailFrom = dependencies.emailFrom ?? serverEnv().emailFrom;
  const actor = automationCronActor();
  const addresses = await recipients.listCurrent(actor);
  const message = await render(payload);
  const alertDigest = workerAlertDigest(payload);

  let sent = 0;
  for (const address of addresses) {
    await transport.send({
      to: address,
      from: emailFrom,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
      idempotencyKey:
        `worker-alert:${alertDigest}:${digest(address.trim().toLowerCase())}`,
    });
    sent += 1;
  }
  return {recipients: addresses.length, sent, failed: 0};
}

function unsubscribeUrl(
  profileId: string,
  locale: "en" | "zh-HK",
  now: Date,
): string {
  const environment = serverEnv();
  const token = signUnsubscribeToken({
    profileId,
    locale,
    exp: Math.floor(now.getTime() / 1000) + UNSUBSCRIBE_TTL_SECONDS,
  }, environment.cronSecret);
  const path = locale === "zh-HK" ? "/zh/unsubscribe" : "/unsubscribe";
  const url = new URL(path, environment.appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function runProductionJourneys(now: Date): Promise<unknown> {
  const environment = serverEnv();
  const portalUrl = new URL("/portal", environment.appUrl).toString();
  return runJourneyBatch({
    journeys: journeysRepository,
    deliveries: deliveriesRepository,
    staffTasks: staffTasksRepository,
    memberships: dunningLapseRepository,
    async loadContext(actor, claim) {
      const context = await jobRunnerContextRepository.loadJourney(
        actor,
        claim.profileId,
        claim.membershipId,
      );
      const renewalDate =
        context.billingPeriodEnd?.toISOString().slice(0, 10) ?? "";
      return {
        hasLoggedIn: context.lastLoginAt !== null,
        profileCompleteness: context.profileComplete ? 100 : 0,
        marketingConsent: context.marketingConsent,
        emailSuppressed: context.emailSuppressed,
        whatsappOptIn: context.whatsappOptIn,
        whatsappNumber: context.whatsappNumber,
        engagementScore: context.engagementScore,
        email: context.email,
        recipientName: context.displayName,
        locale: context.locale,
        variables: {
          displayName: context.displayName,
          ctaUrl: portalUrl,
          profileUrl: portalUrl,
          renewalUrl: portalUrl,
          paymentUrl: portalUrl,
          renewalDate,
          membershipStatus: context.membershipStatus ?? "",
        },
        unsubscribeUrl: unsubscribeUrl(
          context.profileId,
          context.locale,
          now,
        ),
        membershipStatus: context.membershipStatus,
      };
    },
    renderEmail,
    emailTransport: createConfiguredResendTransport(),
    whatsappTransport: createWoztellAdapter({
      WOZTELL_API_TOKEN: process.env.WOZTELL_API_TOKEN,
      WOZTELL_CHANNEL_ID: process.env.WOZTELL_CHANNEL_ID,
      WOZTELL_WEBHOOK_SECRET: process.env.WOZTELL_WEBHOOK_SECRET,
    }),
    emailFrom: environment.emailFrom,
  }, {now, limit: RUNNER_BATCH_LIMIT});
}

async function runProductionCampaigns(now: Date): Promise<unknown> {
  const environment = serverEnv();
  return runCampaignBatch({
    campaigns: campaignsRepository,
    deliveries: deliveriesRepository,
    staffTasks: staffTasksRepository,
    async loadContext(actor, profileId) {
      const context = await jobRunnerContextRepository.loadCampaign(
        actor,
        profileId,
      );
      return {
        ...context,
        unsubscribeUrl: unsubscribeUrl(profileId, context.locale, now),
      };
    },
    renderCampaign: createCampaignEmailRenderer(
      new URL("/", environment.appUrl).toString(),
    ),
    emailTransport: createConfiguredResendTransport(),
    emailFrom: environment.emailFrom,
  }, {now, limit: RUNNER_BATCH_LIMIT});
}

async function runProductionRenewal(now: Date): Promise<unknown> {
  return runRenewalReconciliation(automationCronActor(), now);
}

async function runProductionEngagement(now: Date): Promise<unknown> {
  return recomputeEngagementScores(automationCronActor(), now);
}

async function runProductionApprovals(now: Date): Promise<unknown> {
  return expireStaleApprovals(automationCronActor(), now);
}

export function createJobRunners(
  overrides: ProductionRunnerOverrides = {},
) {
  const runJourneys = overrides.runJourneys ?? runProductionJourneys;
  const runCampaigns = overrides.runCampaigns ?? runProductionCampaigns;
  const runRenewal = overrides.runRenewal ?? runProductionRenewal;
  const runEngagement =
    overrides.runEngagement ?? runProductionEngagement;
  const runApprovals = overrides.runApprovals ?? runProductionApprovals;
  const runWorkerAlert = overrides.runWorkerAlert ?? sendWorkerAlert;

  return {
    async journey(now: Date) {
      const [journeys, campaigns] = await Promise.allSettled([
        Promise.resolve().then(() => runJourneys(now)),
        Promise.resolve().then(() => runCampaigns(now)),
      ]);
      if (journeys.status === "rejected" || campaigns.status === "rejected") {
        throw new Error("AUTOMATION_BATCH_FAILED");
      }
      return {journeys: journeys.value, campaigns: campaigns.value};
    },
    renewal(now: Date) {
      return runRenewal(now);
    },
    engagement(now: Date) {
      return runEngagement(now);
    },
    approvals(now: Date) {
      return runApprovals(now);
    },
    workerAlert(payload: WorkerAlertPayload) {
      return runWorkerAlert(payload);
    },
  };
}

export const jobRunners = createJobRunners();
