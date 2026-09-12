import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import {prepareWorkerAlertRequest} from "@/lib/jobs/runners";

/**
 * Phase C2 Task 10 Step 1. The worker's escalation path and the route that
 * receives it must agree on the job vocabulary.
 *
 * This was already broken before the send queue existed: `workerAlertSchema`
 * listed six jobs and `WorkerJob` listed eight, so three failed runs of
 * `aiops-metrics` or `chat-retention` produced a 400 `INVALID_WORKER_ALERT` and
 * nobody was paged — the one code path whose entire purpose is to be noticed.
 * The send queue would have been the ninth member of the same gap.
 *
 * `WorkerJob` is read as TEXT: `workers/` is excluded from the root
 * `tsconfig.json`, so importing it would be a typecheck failure rather than a
 * contract test.
 */
const WORKER_SOURCE_PATH = "workers/src/index.ts";

function workerJobs(source: string): string[] {
  const declaration = /export type WorkerJob =([\s\S]*?);/m.exec(source);
  if (!declaration) throw new Error("WORKER_JOB_UNION_NOT_FOUND");
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function alertRequest(job: string): Request {
  return new Request("http://localhost/api/jobs/worker-alert", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      job,
      scheduledTime: "2026-09-10T04:20:00.000Z",
      attemptCount: 3,
      errorCode: "JOB_TIMEOUT",
    }),
  });
}

describe("worker alert job vocabulary", () => {
  const jobs = workerJobs(readFileSync(WORKER_SOURCE_PATH, "utf8"));

  it("enumerates every job the worker can invoke", () => {
    expect(jobs).toContain("whatsapp-send-queue");
    expect(jobs).toContain("aiops-metrics");
    expect(jobs).toContain("chat-retention");
  });

  it.each(jobs)("accepts a final-failure alert for %s", async (job) => {
    await expect(prepareWorkerAlertRequest(alertRequest(job)))
      .resolves.toMatchObject({value: {job, attemptCount: 3, errorCode: "JOB_TIMEOUT"}});
  });

  it("still refuses a job the worker cannot invoke", async () => {
    // The enum is not widened to `z.string()`: the run key is a digest of this
    // payload, so an unbounded `job` is an unbounded set of claimable run keys.
    await expect(prepareWorkerAlertRequest(alertRequest("not-a-job")))
      .rejects.toMatchObject({code: "INVALID_WORKER_ALERT"});
  });
});
