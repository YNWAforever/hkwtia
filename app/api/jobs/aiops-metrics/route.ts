import {
  createJobPost,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";
import {M4_AI_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

type AiOpsMetricsRouteOptions = Readonly<{
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
  runner?: (now: Date) => Promise<unknown>;
}>;

export function createAiOpsMetricsPost(
  options: AiOpsMetricsRouteOptions = {},
) {
  return createJobPost({
    kind: M4_AI_JOB_KIND.AI_OPS_METRICS,
    bucket: "hourly",
    jobs: options.jobs,
    now: options.now,
    secret: options.secret,
    run: ({now}) =>
      (options.runner ?? jobRunners.aiOpsMetrics)(now),
  });
}

export const POST = createAiOpsMetricsPost();
