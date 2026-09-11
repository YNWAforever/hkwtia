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

/**
 * Phase C2 (C-5, D-10). A group of its own, and deliberately NOT a member of
 * `M3_AUTOMATION_JOB_KINDS` (S-11).
 *
 * That constant is interpolated into `jobs_automation_recent_idx`'s partial
 * predicate and pinned by `tests/unit/automation-admin-indexes.test.ts`, so
 * adding a member emits an unintended DROP INDEX / CREATE INDEX in the next
 * generated migration and reddens two contract tests for a reason that has
 * nothing to do with the send queue.
 */
export const PHASE_C_JOB_KIND = {
  WHATSAPP_SEND_QUEUE: "whatsapp-send-queue",
} as const;

export const PHASE_C_JOB_KINDS = [
  PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE,
] as const;

export type PhaseCJobKind = typeof PHASE_C_JOB_KINDS[number];
