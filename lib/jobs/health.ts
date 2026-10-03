import "server-only";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor} from "@/lib/membership/lifecycle";
import {jobHealthRepository} from "@/lib/db/repos/job-health";
import {
  HEALTH_JOB_KEYS,
  JOB_HEALTH_SCHEDULE,
  jobHealthEnabled,
  nextJobExpectedAt,
  type HealthJobKey,
} from "@/lib/jobs/health-registry";
import {expectedWorkerRevision} from "@/lib/jobs/worker-health-request";
export const JOB_HEALTH_REASON_CODES = ["DISABLED", "WORKER_REVISION_UNCONFIGURED", "NO_RECEIPT", "INVALID_RECEIPT", "REVISION_MISMATCH", "POLL_IN_PROGRESS", "POLL_OVERDUE", "VERIFIED_SUCCESS", "STALE_RECEIPT", "FAILED_ITEMS", "RECONCILIATION_REQUIRED", "CAPABILITY_MISMATCH"] as const;
export type JobHealthReasonCode = typeof JOB_HEALTH_REASON_CODES[number];
export type JobHealth = Readonly<{
  jobKey: HealthJobKey;
  enabled: boolean | null;
  deploymentSha: string | null;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  nextExpectedAt: string | null;
  oldestPendingAt: string | null;
  failedCount: number | null;
  uncertainCount: number | null;
  reasonCode: JobHealthReasonCode;
  lastVerifiedAt: string | null;
  state: "healthy" | "degraded" | "disabled" | "unknown";
}>;
export type JobHealthSnapshot = Readonly<{
  jobKey: HealthJobKey;
  workerRevision: string;
  lastStartedAt: Date;
  lastSucceededAt: Date | null;
  outcome: string;
  failedCount: number;
  uncertainCount: number;
  oldestPendingAt: Date | null;
}>;
export function projectJobHealth(
  key: HealthJobKey,
  row: JobHealthSnapshot | null,
  now: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
): JobHealth {
  if (!Number.isFinite(now.getTime())) throw Error("INVALID_HEALTH_CLOCK");
  const enabled = jobHealthEnabled(key, env),
    expected = expectedWorkerRevision(env);
  const valid =
    row &&
    Number.isFinite(row.lastStartedAt.getTime()) &&
    row.lastStartedAt <= now &&
    (!row.lastSucceededAt ||
      (Number.isFinite(row.lastSucceededAt.getTime()) &&
        row.lastSucceededAt <= now)) &&
    Number.isSafeInteger(row.failedCount) &&
    row.failedCount >= 0 &&
    Number.isSafeInteger(row.uncertainCount) &&
    row.uncertainCount >= 0 &&
    (!row.oldestPendingAt || Number.isFinite(row.oldestPendingAt.getTime())) &&
    ["processing", "completed", "disabled", "failed", "uncertain"].includes(
      row.outcome,
    );
  const trusted =
    valid && row && expected === row.workerRevision && row.jobKey === key
      ? row
      : null;
  const next = trusted ? nextJobExpectedAt(key, trusted.lastStartedAt) : null;
  const success = trusted?.lastSucceededAt ?? null;
  let state: JobHealth["state"] = "unknown";
  let reasonCode: JobHealthReasonCode = "NO_RECEIPT";
  if (!enabled) {state = "disabled"; reasonCode = "DISABLED";}
  else if (!expected) reasonCode = "WORKER_REVISION_UNCONFIGURED";
  else if (row && (!valid || row.jobKey !== key)) {
    state = "degraded"; reasonCode = "INVALID_RECEIPT";
  } else if (row && row.workerRevision !== expected) {
    state = "degraded"; reasonCode = "REVISION_MISMATCH";
  } else if (trusted) {
    if (trusted.outcome === "uncertain" || trusted.uncertainCount > 0) {
      state = "degraded"; reasonCode = "RECONCILIATION_REQUIRED";
    } else if (trusted.outcome === "failed" || trusted.failedCount > 0) {
      state = "degraded"; reasonCode = "FAILED_ITEMS";
    } else if (trusted.outcome === "disabled") {
      state = "degraded"; reasonCode = "CAPABILITY_MISMATCH";
    } else if (success && next) {
      const stale = now.getTime() > next.getTime() + JOB_HEALTH_SCHEDULE[key].graceMs;
      const unfinished = trusted.lastStartedAt > success
        && now.getTime() - trusted.lastStartedAt.getTime() > JOB_HEALTH_SCHEDULE[key].graceMs;
      state = stale || unfinished ? "degraded" : "healthy";
      reasonCode = stale ? "STALE_RECEIPT" : unfinished ? "POLL_OVERDUE" : "VERIFIED_SUCCESS";
    } else if (now.getTime() > trusted.lastStartedAt.getTime() + JOB_HEALTH_SCHEDULE[key].graceMs) {
      state = "degraded"; reasonCode = "POLL_OVERDUE";
    } else reasonCode = "POLL_IN_PROGRESS";
  }
  return {
    jobKey: key,
    enabled,
    deploymentSha: trusted?.workerRevision ?? null,
    lastStartedAt: trusted?.lastStartedAt.toISOString() ?? null,
    lastSucceededAt: success?.toISOString() ?? null,
    nextExpectedAt: next?.toISOString() ?? null,
    oldestPendingAt: trusted?.oldestPendingAt?.toISOString() ?? null,
    failedCount: trusted?.failedCount ?? null,
    uncertainCount: trusted?.uncertainCount ?? null,
    lastVerifiedAt: success?.toISOString() ?? null,
    reasonCode,
    state,
  };
}
export async function readJobHealth(
  actor: Actor,
  reader: Pick<typeof jobHealthRepository, "read"> = jobHealthRepository,
  now = new Date(),
): Promise<readonly JobHealth[]> {
  requireAdmin(actor);
  const rows = expectedWorkerRevision() ? await reader.read(actor, now) : [];
  return HEALTH_JOB_KEYS.map((key) =>
    projectJobHealth(key, rows.find((row) => row.jobKey === key) ?? null, now),
  );
}
