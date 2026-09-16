import {createJobPost} from "@/lib/jobs/handler";
import {PHASE_D_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: PHASE_D_JOB_KIND.EVENT_CANCELLATION_REFUNDS,
  bucket: "hourly",
  run: ({now}) => jobRunners.eventCancellationRefunds(now),
});
