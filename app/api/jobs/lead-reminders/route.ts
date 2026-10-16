import {createJobPost} from "@/lib/jobs/handler";
import {LEAD_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: LEAD_JOB_KIND.REMINDERS,
  bucket: "daily",
  run: ({now}) => jobRunners.leadReminders(now),
});
