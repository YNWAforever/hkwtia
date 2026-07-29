import {hongKongDateKey} from "@/lib/automation/hong-kong-time";
import {
  retentionAnalystRepository,
  type RetentionAnalystRepository,
} from "@/lib/db/repos/retention-analyst";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createJobPost,
  JobRequestError,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";
import {verifyCronBearer} from "@/lib/jobs/auth";
import {M4_AI_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";
import {serverEnv} from "@/lib/config/env";

type RetentionAnalystRouteOptions = Readonly<{
  candidates?: RetentionAnalystRepository;
  runner?: (now: Date) => Promise<unknown>;
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
}>;

type RequestMode = "live" | "dry-run";

function requestMode(request: Request): RequestMode {
  const parameters = new URL(request.url).searchParams;
  const keys = [...parameters.keys()];
  if (
    keys.length === 0
    && parameters.getAll("dryRun").length === 0
  ) {
    return "live";
  }
  if (
    keys.length === 1
    && keys[0] === "dryRun"
    && parameters.getAll("dryRun").length === 1
    && parameters.get("dryRun") === "1"
  ) {
    return "dry-run";
  }
  throw new JobRequestError(400, "INVALID_RETENTION_ANALYST_REQUEST");
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

function methodNotAllowed(): Response {
  return Response.json({error: "METHOD_NOT_ALLOWED"}, {
    status: 405,
    headers: {allow: "POST", "cache-control": "no-store"},
  });
}

export function createRetentionAnalystPost(
  options: RetentionAnalystRouteOptions = {},
): (request: Request) => Promise<Response> {
  const clock = options.now ?? (() => new Date());
  const configuredSecret = options.secret ?? (() => serverEnv().cronSecret);
  const candidates = options.candidates ?? retentionAnalystRepository;
  const runner = options.runner ?? jobRunners.retentionAnalyst;
  const livePost = createJobPost({
    kind: M4_AI_JOB_KIND.RETENTION_ANALYST,
    bucket: "daily",
    jobs: options.jobs,
    now: clock,
    secret: configuredSecret,
    prepare: async (_request, now) => ({
      value: undefined,
      runKey: `retention-analyst:${hongKongDateKey(now)}`,
    }),
    run: ({now}) => runner(now),
  });

  return async function post(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed();

    let secret: string | null | undefined;
    try {
      secret = configuredSecret();
    } catch {
      return unauthorized();
    }
    if (!verifyCronBearer(request, secret)) return unauthorized();

    let mode: RequestMode;
    try {
      mode = requestMode(request);
    } catch (error) {
      if (error instanceof JobRequestError) {
        return json({error: error.code}, error.status);
      }
      return json({error: "JOB_RUN_FAILED"}, 500);
    }
    if (mode === "live") return livePost(request);

    try {
      const asOf = clock();
      if (!Number.isFinite(asOf.getTime())) {
        return json({error: "JOB_RUN_FAILED"}, 500);
      }
      const considered = (
        await candidates.listCandidates(automationCronActor(), {asOf})
      ).length;
      return json({
        dryRun: true,
        summary: {
          considered,
          drafted: 0,
          skippedPending: 0,
          deduplicated: 0,
          failed: 0,
        },
      });
    } catch {
      return json({error: "JOB_RUN_FAILED"}, 500);
    }
  };
}

export const POST = createRetentionAnalystPost();
