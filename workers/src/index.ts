/// <reference types="@cloudflare/workers-types" />

export type WorkerJob =
  | "journey-runner"
  | "approvals-expirer"
  | "renewal-runner"
  | "engagement-score"
  | "chat-retention"
  | "retention-analyst"
  | "board-reporter";

export type WorkerEnv = Readonly<{
  APP_URL: string;
  CRON_SECRET: string;
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
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

export type WorkerDependencies = Readonly<{
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  logger: Readonly<{
    error: (record: WorkerLog) => void;
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
const RETRY_DELAYS = [250, 1_000] as const;
const ATTEMPT_COUNT = 3;
const BASE_JOBS = [
  "journey-runner",
  "approvals-expirer",
] as const satisfies readonly WorkerJob[];
const JOBS_BY_CRON = {
  "0 * * * *": BASE_JOBS,
  "0 2 * * *": ["renewal-runner"],
  "0 18 * * *": ["engagement-score"],
  "0 3 * * *": ["chat-retention"],
  "15 18 * * *": ["retention-analyst"],
  "30 0 1 * *": ["board-reporter"],
} as const satisfies Readonly<
  Record<string, readonly WorkerJob[]>
>;

const REQUEST_TIMEOUT_BY_JOB = {
  "journey-runner": REQUEST_TIMEOUT_MS,
  "approvals-expirer": REQUEST_TIMEOUT_MS,
  "renewal-runner": REQUEST_TIMEOUT_MS,
  "engagement-score": REQUEST_TIMEOUT_MS,
  "chat-retention": REQUEST_TIMEOUT_MS,
  "retention-analyst": AI_REQUEST_TIMEOUT_MS,
  "board-reporter": AI_REQUEST_TIMEOUT_MS,
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

async function notifyFinalFailure(
  job: WorkerJob,
  scheduledTime: string,
  errorCode: JobFailureCode,
  config: ValidConfig,
  dependencies: WorkerDependencies,
): Promise<void> {
  const payload = {
    job,
    scheduledTime,
    attemptCount: ATTEMPT_COUNT,
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
        return;
      }
      finalErrorCode = "JOB_HTTP_ERROR";
    } catch (error) {
      finalErrorCode = exceptionCode(error);
    }

    if (attempt < ATTEMPT_COUNT) {
      await dependencies.sleep(RETRY_DELAYS[attempt - 1]);
    }
  }

  await notifyFinalFailure(
    job,
    scheduledTime,
    finalErrorCode,
    config,
    dependencies,
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
