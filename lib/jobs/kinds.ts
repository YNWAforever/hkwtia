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

export const M4_AI_JOB_KIND = {
  CHAT_RETENTION: "chat-retention",
  RETENTION_ANALYST: "retention-analyst",
  BOARD_REPORTER: "board-reporter",
  AI_OPS_METRICS: "aiops-metrics",
} as const;

export const M4_AI_JOB_KINDS = [
  M4_AI_JOB_KIND.CHAT_RETENTION,
  M4_AI_JOB_KIND.RETENTION_ANALYST,
  M4_AI_JOB_KIND.BOARD_REPORTER,
  M4_AI_JOB_KIND.AI_OPS_METRICS,
] as const;

export type M4AiJobKind = typeof M4_AI_JOB_KINDS[number];
