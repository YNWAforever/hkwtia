/// <reference types="@cloudflare/workers-types" />

/**
 * Every job the Worker may invoke, declared as a value rather than a bare type
 * so a test can enumerate it. A member added here but absent from
 * `JOBS_BY_CRON` is a job the Worker never runs: the event-cancellation refund
 * sweep shipped exactly that way, with a live route and no trigger, so its
 * headline promise was silently inert until review. `WORKER_JOBS` and
 * `JOBS_BY_CRON` move together, and `tests/worker.test.ts` fails if they drift.
 */
export const WORKER_JOBS = [
  "aiops-metrics",
  "journey-runner",
  "approvals-expirer",
  "renewal-runner",
  "engagement-score",
  "chat-retention",
  "retention-analyst",
  "board-reporter",
  "whatsapp-send-queue",
  "event-cancellation-refunds",
  "event-notifications",
  "showcase-lead-emails",
  "ticket-emails",
  "admin-batches",
  "membership-grant-expiry",
  "rate-limit-cleanup",
  "member-import-retention",
] as const;

export type WorkerJob = typeof WORKER_JOBS[number];

export type WorkerEnv = Readonly<{
  APP_URL: string;
  CRON_SECRET: string;
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
  AUDIT_METRICS_ENABLED?: string;
  WORKER_REVISION?: string;
}>;

type JobFailureCode =
  | "JOB_HTTP_ERROR"
  | "JOB_NETWORK_ERROR"
  | "JOB_TIMEOUT";

type ConfigErrorCode =
  | "INVALID_APP_URL"
  | "INVALID_CRON_SECRET"
  | "INVALID_CRON"
  | "INVALID_SCHEDULED_TIME";

type AlertLogCode =
  | "WORKER_ALERT_HTTP_ERROR"
  | "WORKER_ALERT_NETWORK_ERROR"
  | "WORKER_ALERT_TIMEOUT";

type WorkerLog =
  | Readonly<{errorCode: ConfigErrorCode}>
  | Readonly<{job: WorkerJob; errorCode: AlertLogCode}>;

export type WorkerMetric = Readonly<{event: "worker_invocation"; job: WorkerJob; outcome: "accepted" | "failed"; scheduledTime: string; occurredAt: string; durationMs: number; attempts: number; workerRevision?: string; webRevision?: string; requestId?: string}>;

export type WorkerDependencies = Readonly<{
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  logger: Readonly<{
    error: (record: WorkerLog) => void;
    info?: (record: WorkerMetric) => void;
  }>;
}>;

export type AutomationWorker = Readonly<{
  scheduled: (
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ) => void;
}>;

export const REQUEST_TIMEOUT_MS = 10_000;
export const AI_REQUEST_TIMEOUT_MS = 240_000;
/**
 * Programme D-10. Twenty WhatsApp template sends, each a provider round trip,
 * do not fit in the ten-second default — and a timeout here is not free: the
 * batch has already claimed its recipients, so every abort leaves leases to
 * expire and be re-claimed, which is exactly the resumed-lease case the
 * dispatcher has to answer with `provider_acceptance_uncertain`.
 */
export const QUEUE_REQUEST_TIMEOUT_MS = 30_000;
/**
 * Phase D-4d whole-branch finding. The cancellation sweep refunds up to
 * `RUNNER_BATCH_LIMIT` (100) orders in one pass, each a sequential Stripe round
 * trip; that does not fit in the ten-second default, and the default is not a
 * free ceiling — the batch has already done work when it aborts. Thirty seconds
 * matches the `QUEUE_REQUEST_TIMEOUT_MS` precedent for "a batch of provider
 * round-trips does not fit in 10s".
 *
 * A batch larger than fits in the window is not lost: the refund commit is
 * conditional on `status = 'paid'` and the provider call carries a deterministic
 * per-order key, so the next hourly run picks up whatever stayed `paid` and
 * re-issuing an already-refunded order is a no-op.
 */
export const CANCELLATION_REFUND_TIMEOUT_MS = 30_000;
const RETRY_DELAYS = [250, 1_000] as const;
const ATTEMPT_COUNT = 3;
const BASE_JOBS = [
  "aiops-metrics",
  "approvals-expirer",
  "journey-runner",
  "event-cancellation-refunds",
] as const satisfies readonly WorkerJob[];
/**
 * Exported so a test can prove every `WorkerJob` appears here: a job declared
 * but never scheduled is dead code, and nothing about the route, its runner or
 * its type would say so.
 */
export const JOBS_BY_CRON = {
  "0 * * * *": BASE_JOBS,
  "0 2 * * *": ["renewal-runner"],
  "0 18 * * *": ["engagement-score"],
  "0 3 * * *": ["chat-retention"],
  "15 18 * * *": ["retention-analyst"],
  "30 0 1 * *": ["board-reporter"],
  "*/10 * * * *": ["whatsapp-send-queue", "showcase-lead-emails", "event-notifications", "rate-limit-cleanup", "member-import-retention"],
  "* * * * *": ["ticket-emails", "admin-batches", "membership-grant-expiry"],
} as const satisfies Readonly<
  Record<string, readonly WorkerJob[]>
>;

const REQUEST_TIMEOUT_BY_JOB = {
  "aiops-metrics": REQUEST_TIMEOUT_MS,
  "journey-runner": REQUEST_TIMEOUT_MS,
  "approvals-expirer": REQUEST_TIMEOUT_MS,
  "renewal-runner": REQUEST_TIMEOUT_MS,
  "engagement-score": REQUEST_TIMEOUT_MS,
  "chat-retention": REQUEST_TIMEOUT_MS,
  "retention-analyst": AI_REQUEST_TIMEOUT_MS,
  "board-reporter": AI_REQUEST_TIMEOUT_MS,
  "whatsapp-send-queue": QUEUE_REQUEST_TIMEOUT_MS,
  "event-cancellation-refunds": CANCELLATION_REFUND_TIMEOUT_MS,
  "event-notifications": QUEUE_REQUEST_TIMEOUT_MS,
  "showcase-lead-emails": QUEUE_REQUEST_TIMEOUT_MS,
  "ticket-emails": QUEUE_REQUEST_TIMEOUT_MS,
  "admin-batches": QUEUE_REQUEST_TIMEOUT_MS,
  "membership-grant-expiry": REQUEST_TIMEOUT_MS,
  "rate-limit-cleanup": REQUEST_TIMEOUT_MS,
  "member-import-retention": QUEUE_REQUEST_TIMEOUT_MS,
} as const satisfies Readonly<Record<WorkerJob, number>>;

class WorkerConfigError extends Error {
  readonly code: ConfigErrorCode;

  constructor(code: ConfigErrorCode) {
    super(code);
    this.name = "WorkerConfigError";
    this.code = code;
  }
}

type ValidConfig = Readonly<{
  appUrl: URL;
  secret: string;
  protectionBypass: string | null;
  metricsEnabled: boolean;
  revision?: string;
}>;

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]"
  );
}

function validateConfig(env: WorkerEnv): ValidConfig {
  if (
    typeof env.CRON_SECRET !== "string"
    || env.CRON_SECRET.trim().length === 0
    || env.CRON_SECRET.length > 4_096
  ) {
    throw new WorkerConfigError("INVALID_CRON_SECRET");
  }
  if (
    typeof env.APP_URL !== "string"
    || env.APP_URL.length === 0
    || env.APP_URL.length > 2_048
  ) {
    throw new WorkerConfigError("INVALID_APP_URL");
  }

  let appUrl: URL;
  try {
    appUrl = new URL(env.APP_URL);
  } catch {
    throw new WorkerConfigError("INVALID_APP_URL");
  }

  const isHttp = appUrl.protocol === "http:";
  if (
    (appUrl.protocol !== "https:" && !isHttp)
    || (isHttp && !isLocalHostname(appUrl.hostname))
    || appUrl.username.length > 0
    || appUrl.password.length > 0
    || appUrl.search.length > 0
    || appUrl.hash.length > 0
  ) {
    throw new WorkerConfigError("INVALID_APP_URL");
  }

  appUrl.pathname = appUrl.pathname.replace(/\/+$/u, "") || "/";
  return {
    appUrl,
    metricsEnabled: env.AUDIT_METRICS_ENABLED === "true",
    revision: env.WORKER_REVISION && /^[a-f0-9]{7,40}$/i.test(env.WORKER_REVISION) ? env.WORKER_REVISION : undefined,
    secret: env.CRON_SECRET,
    protectionBypass:
      env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null,
  };
}

function dueJobs(cron: string): readonly WorkerJob[] {
  const jobs = JOBS_BY_CRON[cron as keyof typeof JOBS_BY_CRON];
  if (!jobs) {
    throw new WorkerConfigError("INVALID_CRON");
  }
  return [...new Set<WorkerJob>(jobs)];
}

function canonicalScheduledTime(value: number): string {
  const scheduledTime = new Date(value);
  if (!Number.isFinite(scheduledTime.getTime())) {
    throw new WorkerConfigError("INVALID_SCHEDULED_TIME");
  }
  return scheduledTime.toISOString();
}

function endpointUrl(appUrl: URL, job: WorkerJob | "worker-alert"): string {
  const endpoint = new URL(appUrl.toString());
  const basePath = endpoint.pathname.replace(/\/+$/u, "");
  endpoint.pathname = `${basePath}/api/jobs/${job}`;
  return endpoint.toString();
}

function exceptionCode(error: unknown): JobFailureCode {
  const name =
    typeof error === "object"
    && error !== null
    && "name" in error
    && typeof error.name === "string"
      ? error.name
      : "";
  return name === "TimeoutError" || name === "AbortError"
    ? "JOB_TIMEOUT"
    : "JOB_NETWORK_ERROR";
}

function alertLogCode(error: unknown): AlertLogCode {
  return exceptionCode(error) === "JOB_TIMEOUT"
    ? "WORKER_ALERT_TIMEOUT"
    : "WORKER_ALERT_NETWORK_ERROR";
}

async function fetchWithDeadline(
  dependencies: WorkerDependencies,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await dependencies.fetch(input, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function logSanitized(
  logger: WorkerDependencies["logger"],
  record: WorkerLog,
): void {
  try {
    logger.error(record);
  } catch {
    // A monitoring sink must not break other scheduled jobs.
  }
}

async function notifyFailure(
  job: WorkerJob,
  scheduledTime: string,
  errorCode: JobFailureCode,
  attemptCount: number,
  config: ValidConfig,
  dependencies: WorkerDependencies,
): Promise<void> {
  const payload = {
    job,
    scheduledTime,
    attemptCount,
    errorCode,
  } as const;

  try {
    const response = await fetchWithDeadline(
      dependencies,
      endpointUrl(config.appUrl, "worker-alert"),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.secret}`,
          "content-type": "application/json",
          ...(config.protectionBypass
            ? {
                "x-vercel-protection-bypass":
                  config.protectionBypass,
              }
            : {}),
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      logSanitized(dependencies.logger, {
        job,
        errorCode: "WORKER_ALERT_HTTP_ERROR",
      });
    }
  } catch (error) {
    logSanitized(dependencies.logger, {
      job,
      errorCode: alertLogCode(error),
    });
  }
}

async function invokeJob(
  job: WorkerJob,
  scheduledTime: string,
  config: ValidConfig,
  dependencies: WorkerDependencies,
): Promise<void> {
  const started = Date.now();
  function metric(outcome: "accepted" | "failed", attempts: number, response?: Response) {
    if (!config.metricsEnabled) return;
    const webRevision = response?.headers.get("x-hkwtia-revision");
    const requestId = response?.headers.get("x-request-id");
    try { dependencies.logger.info?.({event: "worker_invocation", job, outcome, scheduledTime, occurredAt: new Date().toISOString(), durationMs: Math.max(0, Date.now()-started), attempts,
      ...(config.revision ? {workerRevision: config.revision} : {}),
      ...(webRevision && /^[a-f0-9]{7,40}$/i.test(webRevision) ? {webRevision} : {}),
      ...(requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? {requestId} : {}),
    }); } catch {/* Observation cannot alter delivery or alert behavior. */}
  }
  let finalErrorCode: JobFailureCode = "JOB_NETWORK_ERROR";

  for (let attempt = 1; attempt <= ATTEMPT_COUNT; attempt += 1) {
    try {
      const response = await fetchWithDeadline(
        dependencies,
        endpointUrl(config.appUrl, job),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.secret}`,
            ...(config.protectionBypass
              ? {
                  "x-vercel-protection-bypass":
                    config.protectionBypass,
                }
              : {}),
          },
        },
        REQUEST_TIMEOUT_BY_JOB[job],
      );
      if (response.ok) {
        metric("accepted", attempt, response);
        return;
      }
      finalErrorCode = "JOB_HTTP_ERROR";
    } catch (error) {
      finalErrorCode = exceptionCode(error);
    }

    // A refund batch can fail for one order, then succeed on the next retry
    // after deferring that order. Preserve the first failure as an alert.
    if (job === "event-cancellation-refunds" && attempt === 1) {
      await notifyFailure(
        job, scheduledTime, finalErrorCode, attempt, config, dependencies,
      );
    }
    if (attempt < ATTEMPT_COUNT) {
      await dependencies.sleep(RETRY_DELAYS[attempt - 1]);
    }
  }

  metric("failed", ATTEMPT_COUNT);
  await notifyFailure(
    job, scheduledTime, finalErrorCode, ATTEMPT_COUNT, config, dependencies,
  );
}

async function runScheduled(
  controller: ScheduledController,
  env: WorkerEnv,
  dependencies: WorkerDependencies,
): Promise<void> {
  const config = validateConfig(env);
  const jobs = dueJobs(controller.cron);
  const scheduledTime = canonicalScheduledTime(controller.scheduledTime);
  await Promise.allSettled(
    jobs.map((job) =>
      invokeJob(job, scheduledTime, config, dependencies),
    ),
  );
}

const defaultDependencies: WorkerDependencies = {
  fetch: (input, init) => fetch(input, init),
  sleep: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
  logger: {
    info: (record) => console.info(JSON.stringify(record)),
    error: (record) => {
      console.error(record);
    },
  },
};

export function createAutomationWorker(
  overrides: Partial<WorkerDependencies> = {},
): AutomationWorker {
  const dependencies: WorkerDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  return {
    scheduled(controller, env, ctx) {
      const execution = runScheduled(
        controller,
        env,
        dependencies,
      ).catch((error: unknown) => {
        const errorCode =
          error instanceof WorkerConfigError
            ? error.code
            : "INVALID_SCHEDULED_TIME";
        logSanitized(dependencies.logger, {errorCode});
      });
      ctx.waitUntil(execution);
    },
  };
}

export default createAutomationWorker() satisfies ExportedHandler<WorkerEnv>;
