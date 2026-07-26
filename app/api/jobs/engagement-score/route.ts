import {createJobPost} from "@/lib/jobs/handler";
import {M3_AUTOMATION_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: M3_AUTOMATION_JOB_KIND.ENGAGEMENT_SCORE,
  bucket: "daily",
  run: ({now}) => jobRunners.engagement(now),
});
