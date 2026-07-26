import {createJobPost} from "@/lib/jobs/handler";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: "approvals-expirer",
  bucket: "hourly",
  run: ({now}) => jobRunners.approvals(now),
});
