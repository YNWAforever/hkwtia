import {createJobPost} from "@/lib/jobs/handler";
import {PHASE_D_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: PHASE_D_JOB_KIND.SHOWCASE_LEAD_EMAILS,
  bucket: "ten-minute",
  run: ({now}) => jobRunners.showcaseLeadEmails(now),
});
