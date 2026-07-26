import {createJobPost} from "@/lib/jobs/handler";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: "renewal-runner",
  bucket: "daily",
  run: ({now}) => jobRunners.renewal(now),
});
