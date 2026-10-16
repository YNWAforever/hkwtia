import {createJobPost} from "@/lib/jobs/handler";
import {ADMIN_BATCH_JOB_KIND} from "@/lib/jobs/kinds";
import {runAdminBatchJob} from "@/lib/jobs/admin-batch-runner";

export const POST = createJobPost({
  kind: ADMIN_BATCH_JOB_KIND.ADMIN_BATCHES,
  bucket: "minute",
  run: async ({now}) => {
    if (process.env.ADMIN_BATCH_ENABLED !== "true") return {claimed: 0, settled: 0, failed: 0, disabled: true};
    const result = await runAdminBatchJob(now);
    if (result.failed > 0) throw new Error("ADMIN_BATCH_SETTLEMENT_FAILED");
    return result;
  },
});
