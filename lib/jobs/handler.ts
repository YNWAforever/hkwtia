import "server-only";
import {observeAuditResponse} from "@/lib/observability/audit-metrics";

import {
  automationCronActor,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import {automationEnv} from "@/lib/config/env";
import {
  jobsRepository,
  type JobClaimResult as RepositoryJobClaimResult,
} from "@/lib/db/repos/jobs";
import {jobHealthRepository} from "@/lib/db/repos/job-health";
import {verifyWorkerHealthRequest,type VerifiedWorkerPoll} from "@/lib/jobs/worker-health-request";
import {jobHealthEnabled,isHealthJobKey} from "@/lib/jobs/health-registry";
import type {JobPollOutcome} from "@/lib/db/repos/job-health";
import {verifyCronBearer} from "@/lib/jobs/auth";

/**
 * The window a job's `run_key` is derived from. Phase C2 (S-12) adds
 * `"ten-minute"` because `jobsRepository.claim` only reclaims a row in state
 * `failed`: on an `hourly` key, ticks 2-6 of every hour would claim the key tick
 * 1 already completed, the route would answer `200 {"duplicate": true}`, and the
 * WhatsApp send queue would drain once an hour while every log line said it was
 * healthy.
 */
export type JobBucket = "hourly" | "daily" | "ten-minute" | "minute";
export type JobClaimResult = RepositoryJobClaimResult;

export type JobHandlerRepository = Readonly<{
  inspectRun?(actor: AutomationCronActor, runKey: string): Promise<"processing" | "completed" | "failed" | null>;
  claim(
    actor: AutomationCronActor,
    runKey: string,
    kind: string,
  ): Promise<JobClaimResult>;
  complete(
    actor: AutomationCronActor,
    runKey: string,
    attemptCount: number,
  ): Promise<boolean>;
  fail(
    actor: AutomationCronActor,
    runKey: string,
    attemptCount: number,
    errorCode: string,
  ): Promise<boolean>;
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
  health?: Pick<typeof jobHealthRepository,"start"|"finish">;
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
  // `2026-09-10T04:23:45.678Z`.slice(0, 15) is `2026-09-10T04:2`, and the
  // appended `0` floors it to the window. Built by slicing rather than by
  // millisecond arithmetic so the key can never acquire a `.`, which
  // SAFE_RUN_KEY refuses.
  if (bucket === "ten-minute") return `${kind}:${instant.slice(0, 15)}0`;
  if (bucket === "minute") return `${kind}:${instant.slice(0, 16)}`;
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

function json(body: Readonly<Record<string, unknown>>, status = 200, outcome = status >= 400 ? "failed" : "processing"): Response {
  return Response.json(body, {
    status,
    headers: {"cache-control": "no-store", "x-hkwtia-job-outcome": outcome},
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
  const secret = options.secret ?? (() => automationEnv().cronSecret);
  const actor = automationCronActor();

  const run = async function post(request: Request): Promise<Response> {
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

    let poll: VerifiedWorkerPoll | null = verifyWorkerHealthRequest(request,options.kind,configuredSecret,now);
    const health=options.health??jobHealthRepository;
    if(poll){try{await health.start(actor,poll);}catch{poll=null;}}
    async function finish(body:Readonly<Record<string,unknown>>,status:number,outcome:JobPollOutcome,summary:Readonly<Record<string,unknown>>={}){
      if(poll){try{await health.finish(actor,poll,outcome,clock(),summary);}catch{/* Missing observation stays unknown/degraded; it never changes delivery ownership. */}}
      return json(body,status,outcome);
    }
    let claim: JobClaimResult;
    try {
      claim = await jobs.claim(actor, runKey, options.kind);
    } catch {
      return finish({error:"JOB_RUN_FAILED"},500,"failed");
    }
    if (claim.status === "duplicate") {
      let state:"processing"|"completed"|"failed"|null=null;
      try{state=await jobs.inspectRun?.(actor,runKey)??null;}catch{/* A duplicate is not proof of completion. */}
      const outcome=state==="completed"?(isHealthJobKey(options.kind)&&!jobHealthEnabled(options.kind)?"disabled":"completed"):"uncertain";
      return finish({duplicate:true},200,outcome);
    }
    const attemptCount = claim.attemptCount;

    let result: unknown;
    try {
      result = await options.run({request, now, runKey, prepared});
    } catch {
      try {
        const settled = await jobs.fail(
          actor,
          runKey,
          attemptCount,
          "JOB_RUN_FAILED",
        );
        return settled ? finish({error:"JOB_RUN_FAILED"},500,"failed") : finish({stale:true},200,"uncertain");
      } catch {
        return finish({error:"JOB_RUN_FAILED"},500,"failed");
      }
    }

    const summary = sanitizedRecord(result);
    try {
      const settled = await jobs.complete(actor, runKey, attemptCount);
      if (!settled) return finish({stale:true},200,"uncertain");
    } catch {
      try {
        const failedSettlement = await jobs.fail(
          actor,
          runKey,
          attemptCount,
          "JOB_RUN_FAILED",
        );
        return failedSettlement ? finish({error:"JOB_RUN_FAILED"},500,"failed") : finish({stale:true},200,"uncertain");
      } catch {
        return finish({error:"JOB_RUN_FAILED"},500,"failed");
      }
    }
    return finish({duplicate:false,summary},200,summary.disabled===true?"disabled":"completed",summary);
  };
  return request => observeAuditResponse("job_result", () => run(request), () => ({kind: options.kind}));
}
