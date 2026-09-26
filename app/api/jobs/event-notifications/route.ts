import {createJobPost} from "@/lib/jobs/handler";
import {PHASE_D_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: PHASE_D_JOB_KIND.EVENT_NOTIFICATIONS,
  bucket: "ten-minute",
  run: ({now}) => jobRunners.eventNotifications(now),
});
