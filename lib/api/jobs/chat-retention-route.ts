import {
  chatRetentionRepository,
  runChatRetention,
  type ChatRetentionRepository,
} from "@/lib/ai/retention";
import {
  createJobPost,
  JobRequestError,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";
import {M4_AI_JOB_KIND} from "@/lib/jobs/kinds";

type ChatRetentionRequest = Readonly<{dryRun: boolean}>;

type ChatRetentionRouteOptions = Readonly<{
  repository?: ChatRetentionRepository;
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
  batchSize?: number;
  maxBatches?: number;
}>;

function prepareRequest(
  request: Request,
  now: Date,
): Readonly<{value: ChatRetentionRequest; runKey?: string}> {
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => key !== "dryRun")
    || url.searchParams.getAll("dryRun").length > 1
  ) {
    throw new JobRequestError(400, "INVALID_RETENTION_REQUEST");
  }
  const rawDryRun = url.searchParams.get("dryRun");
  if (
    rawDryRun !== null
    && rawDryRun !== "true"
    && rawDryRun !== "false"
  ) {
    throw new JobRequestError(400, "INVALID_RETENTION_REQUEST");
  }
  const dryRun = rawDryRun === "true";
  return {
    value: {dryRun},
    runKey: dryRun
      ? `chat-retention:dry-run:${now.toISOString().slice(0, 10)}`
      : `chat-retention:${now.toISOString().slice(0, 10)}`,
  };
}

export function createChatRetentionPost(
  options: ChatRetentionRouteOptions = {},
): (request: Request) => Promise<Response> {
  const repository = options.repository ?? chatRetentionRepository;
  return createJobPost<ChatRetentionRequest>({
    kind: M4_AI_JOB_KIND.CHAT_RETENTION,
    bucket: "daily",
    jobs: options.jobs,
    now: options.now,
    secret: options.secret,
    prepare: async (request, now) => prepareRequest(request, now),
    run: ({now, prepared}) => runChatRetention({
      repository,
      now,
      dryRun: prepared.dryRun,
      batchSize: options.batchSize,
      maxBatches: options.maxBatches,
    }),
  });
}

export const POST = createChatRetentionPost();
