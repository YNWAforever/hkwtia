import "server-only";

import {
  automationCronActor,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import {serverEnv} from "@/lib/config/env";
import {jobsRepository} from "@/lib/db/repos/jobs";
import {verifyCronBearer} from "@/lib/jobs/auth";

export type JobBucket = "hourly" | "daily";
export type JobClaimResult = "claimed" | "duplicate";

export type JobHandlerRepository = Readonly<{
  claim(
    actor: AutomationCronActor,
    runKey: string,
    kind: string,
  ): Promise<JobClaimResult>;
  complete(actor: AutomationCronActor, runKey: string): Promise<unknown>;
  fail(
    actor: AutomationCronActor,
    runKey: string,
    errorCode: string,
  ): Promise<unknown>;
}>;

export type PreparedJob<T> = Readonly<{
  value: T;
  runKey?: string;
}>;

export type JobRunContext<T> = Readonly<{
  request: Request;
  now: Date;
  runKey: string;
  prepared: T;
}>;

type CreateJobPostOptions<T> = Readonly<{
  kind: string;
  bucket: JobBucket;
  run(context: JobRunContext<T>): Promise<unknown>;
  prepare?(request: Request, now: Date): Promise<PreparedJob<T>>;
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
}>;

const SAFE_KIND = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_RUN_KEY = /^[A-Za-z0-9:-]{1,160}$/;
const SAFE_SUMMARY_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_SUMMARY_KEYS = 32;
const MAX_SUMMARY_DEPTH = 2;
const MAX_SUMMARY_NUMBER = 1_000_000_000;

export class JobRequestError extends Error {
  constructor(
    readonly status: 400 | 413 | 415,
    readonly code: string,
  ) {
    super(code);
    this.name = "JobRequestError";
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function runKeyFor(
  kind: string,
  bucket: JobBucket,
  now: Date,
): string {
  if (!SAFE_KIND.test(kind) || !validDate(now)) {
    throw new Error("INVALID_JOB_CONFIGURATION");
  }
  const instant = now.toISOString();
  return `${kind}:${bucket === "hourly" ? instant.slice(0, 13) : instant.slice(0, 10)}`;
}

function safeNumber(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(-MAX_SUMMARY_NUMBER, Math.min(MAX_SUMMARY_NUMBER, value));
}

function sanitizedRecord(
  value: unknown,
  depth = 0,
): Readonly<Record<string, unknown>> {
  if (
    depth >= MAX_SUMMARY_DEPTH
    || value === null
    || typeof value !== "object"
    || Array.isArray(value)
  ) {
    return {};
  }
  const output: Record<string, unknown> = {};
  let accepted = 0;
  for (const [key, item] of Object.entries(value)) {
    if (accepted >= MAX_SUMMARY_KEYS || !SAFE_SUMMARY_KEY.test(key)) continue;
    if (typeof item === "number") {
      const safe = safeNumber(item);
      if (safe === null) continue;
      output[key] = safe;
      accepted += 1;
      continue;
    }
    if (typeof item === "boolean") {
      output[key] = item;
      accepted += 1;
      continue;
    }
    const nested = sanitizedRecord(item, depth + 1);
    if (Object.keys(nested).length > 0) {
      output[key] = nested;
      accepted += 1;
    }
  }
  return output;
}

function json(body: Readonly<Record<string, unknown>>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {"cache-control": "no-store"},
  });
}

function unauthorized(): Response {
  return Response.json({error: "UNAUTHORIZED"}, {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": "Bearer",
    },
  });
}

function failed(): Response {
  return json({error: "JOB_RUN_FAILED"}, 500);
}

export function createJobPost<T = undefined>(
  options: CreateJobPostOptions<T>,
): (request: Request) => Promise<Response> {
  if (!SAFE_KIND.test(options.kind)) {
    throw new Error("INVALID_JOB_CONFIGURATION");
  }
  const jobs = options.jobs ?? jobsRepository;
  const clock = options.now ?? (() => new Date());
  const secret = options.secret ?? (() => serverEnv().cronSecret);
  const actor = automationCronActor();

  return async function post(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json({error: "METHOD_NOT_ALLOWED"}, {
        status: 405,
        headers: {
          allow: "POST",
          "cache-control": "no-store",
        },
      });
    }

    let configuredSecret: string | null | undefined;
    try {
      configuredSecret = secret();
    } catch {
      return unauthorized();
    }
    if (!verifyCronBearer(request, configuredSecret)) return unauthorized();

    let now: Date;
    let prepared: T;
    let runKey: string;
    try {
      now = clock();
      if (!validDate(now)) throw new Error("INVALID_JOB_CLOCK");
      const preparation = options.prepare
        ? await options.prepare(request, now)
        : {value: undefined as T};
      prepared = preparation.value;
      runKey = preparation.runKey ?? runKeyFor(options.kind, options.bucket, now);
      if (!SAFE_RUN_KEY.test(runKey)) throw new Error("INVALID_JOB_RUN_KEY");
    } catch (error) {
      if (error instanceof JobRequestError) {
        return json({error: error.code}, error.status);
      }
      return failed();
    }

    let claim: JobClaimResult;
    try {
      claim = await jobs.claim(actor, runKey, options.kind);
    } catch {
      return failed();
    }
    if (claim === "duplicate") return json({duplicate: true});

    try {
      const result = await options.run({request, now, runKey, prepared});
      const summary = sanitizedRecord(result);
      await jobs.complete(actor, runKey);
      return json({duplicate: false, summary});
    } catch {
      try {
        await jobs.fail(actor, runKey, "JOB_RUN_FAILED");
      } catch {
        // Preserve the generic failure response when recording is unavailable.
      }
      return failed();
    }
  };
}
