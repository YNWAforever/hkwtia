import {describe, expect, it} from "vitest";
import {projectJobHealth, type JobHealthSnapshot} from "@/lib/jobs/health";
const now = new Date("2026-10-03T12:00:00Z");
const revision = "a".repeat(40);
const env = {WORKER_HEALTH_REVISION: revision};
const row: JobHealthSnapshot = {jobKey: "rate-limit-cleanup", workerRevision: revision, lastStartedAt: now, lastSucceededAt: now, outcome: "completed", failedCount: 0, uncertainCount: 0, oldestPendingAt: null};
describe("worker readiness reason and observation boundaries", () => {
  it("no receipt is unknown, not a measured zero or a successful poll", () => {
    expect(projectJobHealth(row.jobKey, null, now, env)).toMatchObject({state: "unknown", reasonCode: "NO_RECEIPT", failedCount: null, uncertainCount: null, lastVerifiedAt: null});
  });
  it("a receipt from the wrong pinned version is degraded with no trusted counters", () => {
    expect(projectJobHealth(row.jobKey, {...row, workerRevision: "b".repeat(40)}, now, env)).toMatchObject({state: "degraded", reasonCode: "REVISION_MISMATCH", failedCount: null, uncertainCount: null, lastVerifiedAt: null});
  });
  it("a matching completed empty poll is observed and healthy", () => {
    expect(projectJobHealth(row.jobKey, row, now, env)).toMatchObject({state: "healthy", reasonCode: "VERIFIED_SUCCESS", failedCount: 0, uncertainCount: 0, lastVerifiedAt: now.toISOString()});
  });
  it("a matching start or HTTP 200 without completion is still unknown", () => {
    expect(projectJobHealth(row.jobKey, {...row, lastSucceededAt: null, outcome: "processing"}, now, env)).toMatchObject({state: "unknown", reasonCode: "POLL_IN_PROGRESS", lastVerifiedAt: null});
  });
  it("an expired expected window is degraded and retains its historical verification time", () => {
    expect(projectJobHealth(row.jobKey, row, new Date(now.getTime()+721000), env)).toMatchObject({state: "degraded", reasonCode: "STALE_RECEIPT", lastVerifiedAt: now.toISOString()});
  });
  it("disabled is an explicit capability state and not an error", () => {
    expect(projectJobHealth("admin-batches", null, now, env)).toMatchObject({state: "disabled", reasonCode: "DISABLED", failedCount: null, uncertainCount: null});
  });
  it("unknown external effects retain their reconciliation requirement", () => {
    expect(projectJobHealth(row.jobKey, {...row, outcome: "uncertain", uncertainCount: 2}, now, env)).toMatchObject({state: "degraded", reasonCode: "RECONCILIATION_REQUIRED", uncertainCount: 2});
  });
});
