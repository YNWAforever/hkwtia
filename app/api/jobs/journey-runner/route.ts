import {createJobPost} from "@/lib/jobs/handler";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: "journey-runner",
  bucket: "hourly",
  run: ({now}) => jobRunners.journey(now),
});
