export const M3_AUTOMATION_JOB_KIND = {
  JOURNEY: "journey-runner",
  RENEWAL: "renewal-runner",
  ENGAGEMENT_SCORE: "engagement-score",
  APPROVALS_EXPIRER: "approvals-expirer",
  WORKER_ALERT: "worker-alert",
} as const;

export const M3_AUTOMATION_JOB_KINDS = [
  M3_AUTOMATION_JOB_KIND.JOURNEY,
  M3_AUTOMATION_JOB_KIND.RENEWAL,
  M3_AUTOMATION_JOB_KIND.ENGAGEMENT_SCORE,
  M3_AUTOMATION_JOB_KIND.APPROVALS_EXPIRER,
  M3_AUTOMATION_JOB_KIND.WORKER_ALERT,
] as const;

export const M3_AUTOMATION_JOB_KIND_SQL_LIST =
  M3_AUTOMATION_JOB_KINDS
    .map((kind) => `'${kind.replaceAll("'", "''")}'`)
    .join(", ");

export type M3AutomationJobKind =
  typeof M3_AUTOMATION_JOB_KINDS[number];
