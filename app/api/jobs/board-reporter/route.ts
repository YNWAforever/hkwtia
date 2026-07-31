import type {BoardFactPack} from "@/lib/ai/board-reporter/contracts";
import {buildBoardFactPack} from "@/lib/ai/board-reporter/facts";
import {previousHongKongMonthWindow} from "@/lib/ai/board-reporter/reporting-window";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {serverEnv} from "@/lib/config/env";
import {
  createJobPost,
  JobRequestError,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";
import {verifyCronBearer} from "@/lib/jobs/auth";
import {M4_AI_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

type BoardReporterRouteOptions = Readonly<{
  buildFactPack?: (asOf: Date) => Promise<BoardFactPack>;
  runner?: (now: Date) => Promise<unknown>;
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
}>;

type RequestMode = "live" | "dry-run";

const dryRunActor: ScheduledAgentActor = {
  kind: "agent",
  agent: "board_reporter",
  runId: "board-reporter-dry-run",
  conversationId: null,
  profileId: null,
  trigger: "scheduled",
};

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
  throw new JobRequestError(400, "INVALID_BOARD_REPORTER_REQUEST");
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

async function productionFactPack(asOf: Date): Promise<BoardFactPack> {
  return buildBoardFactPack(dryRunActor, asOf);
}

export function createBoardReporterPost(
  options: BoardReporterRouteOptions = {},
): (request: Request) => Promise<Response> {
  const clock = options.now ?? (() => new Date());
  const configuredSecret = options.secret ?? (() => serverEnv().cronSecret);
  const buildFacts = options.buildFactPack ?? productionFactPack;
  const runner = options.runner ?? jobRunners.boardReporter;
  const livePost = createJobPost({
    kind: M4_AI_JOB_KIND.BOARD_REPORTER,
    bucket: "daily",
    jobs: options.jobs,
    now: clock,
    secret: configuredSecret,
    prepare: async (_request, now) => {
      const {reportMonth} = previousHongKongMonthWindow(now);
      return {
        value: undefined,
        runKey: `board-reporter:${reportMonth}`,
      };
    },
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
      const facts = await buildFacts(asOf);
      return json({
        dryRun: true,
        reportMonth: facts.reportMonth,
        facts,
      });
    } catch {
      return json({error: "JOB_RUN_FAILED"}, 500);
    }
  };
}

export const POST = createBoardReporterPost();
