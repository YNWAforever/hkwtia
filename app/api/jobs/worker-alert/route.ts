import {createJobPost} from "@/lib/jobs/handler";
import {
  jobRunners,
  prepareWorkerAlertRequest,
  type WorkerAlertPayload,
} from "@/lib/jobs/runners";

export const POST = createJobPost<WorkerAlertPayload>({
  kind: "worker-alert",
  bucket: "hourly",
  prepare: prepareWorkerAlertRequest,
  run: ({prepared}) => jobRunners.workerAlert(prepared),
});
