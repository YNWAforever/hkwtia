import {createJobPost} from "@/lib/jobs/handler";
import {M3_AUTOMATION_JOB_KIND} from "@/lib/jobs/kinds";
import {
  jobRunners,
  prepareWorkerAlertRequest,
  type WorkerAlertPayload,
} from "@/lib/jobs/runners";

export const POST = createJobPost<WorkerAlertPayload>({
  kind: M3_AUTOMATION_JOB_KIND.WORKER_ALERT,
  bucket: "hourly",
  prepare: prepareWorkerAlertRequest,
  run: ({prepared}) => jobRunners.workerAlert(prepared),
});
