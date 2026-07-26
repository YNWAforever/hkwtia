import {createJobPost} from "@/lib/jobs/handler";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: "engagement-score",
  bucket: "daily",
  run: ({now}) => jobRunners.engagement(now),
});
