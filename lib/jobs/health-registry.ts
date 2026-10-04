/** Read-only mapping of the existing worker schedule, never another scheduler. */
export const JOB_HEALTH_SCHEDULE = {
  "aiops-metrics": {crons: ["0 * * * *"], graceMs: 300000},
  "journey-runner": {crons: ["0 * * * *"], graceMs: 300000},
  "approvals-expirer": {crons: ["0 * * * *"], graceMs: 300000},
  "renewal-runner": {crons: ["0 2 * * *"], graceMs: 600000},
  "engagement-score": {crons: ["0 18 * * *"], graceMs: 600000},
  "chat-retention": {crons: ["0 3 * * *"], graceMs: 600000},
  "retention-analyst": {crons: ["15 18 * * *"], graceMs: 600000},
  "board-reporter": {crons: ["30 0 1 * *"], graceMs: 600000},
  "whatsapp-send-queue": {crons: ["*/10 * * * *"], graceMs: 120000},
  "event-cancellation-refunds": {crons: ["0 * * * *"], graceMs: 300000},
  "event-notifications": {
    crons: ["*/10 * * * *"],
    graceMs: 120000,
    flag: "EVENT_CANCELLATION_NOTICES_ENABLED",
  },
  "showcase-lead-emails": {crons: ["*/10 * * * *"], graceMs: 120000},
  "ticket-emails": {crons: ["* * * * *"], graceMs: 120000},
  "admin-batches": {
    crons: ["* * * * *"],
    graceMs: 120000,
    flag: "ADMIN_BATCH_ENABLED",
  },
  "membership-grant-expiry": {
    crons: ["* * * * *"],
    graceMs: 120000,
    flag: "MEMBERSHIP_GRANTS_ENABLED",
  },
  "rate-limit-cleanup": {crons: ["*/10 * * * *"], graceMs: 120000},
  "member-import-retention": {
    crons: ["*/10 * * * *"],
    graceMs: 120000,
    flag: "MEMBER_IMPORT_RETENTION_ENABLED",
  },
} as const;
export type HealthJobKey = keyof typeof JOB_HEALTH_SCHEDULE;
export const HEALTH_JOB_KEYS = Object.freeze(
  Object.keys(JOB_HEALTH_SCHEDULE) as HealthJobKey[],
);
export function isHealthJobKey(value: string): value is HealthJobKey {
  return Object.hasOwn(JOB_HEALTH_SCHEDULE, value);
}
export function jobHealthEnabled(
  key: HealthJobKey,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const configured = env.WORKER_HEALTH_JOBS;
  if (configured !== undefined) {
    const keys =
      configured === "none"
        ? []
        : configured.split(",").map((value) => value.trim());
    if (
      (keys.length === 0 && configured !== "none") ||
      new Set(keys).size !== keys.length ||
      keys.some((value) => !isHealthJobKey(value))
    )
      throw Error("INVALID_WORKER_JOB_SCOPE");
    if (!keys.includes(key)) return false;
  }
  if(key==="retention-analyst")return env.AGENTS_ENABLED==="true"&&env.ADMIN_AI_RETENTION_DRAFTS_ENABLED==="true";
  const config = JOB_HEALTH_SCHEDULE[key];
  return "flag" in config ? env[config.flag] === "true" : true;
}
export function nextJobExpectedAt(key: HealthJobKey, after: Date): Date {
  if (!Number.isFinite(after.getTime())) throw Error("INVALID_HEALTH_CLOCK");
  const cron = JOB_HEALTH_SCHEDULE[key].crons[0];
  const next = new Date(after);
  next.setUTCSeconds(0, 0);
  if (cron === "* * * * *") next.setUTCMinutes(next.getUTCMinutes() + 1);
  else if (cron === "*/10 * * * *")
    next.setUTCMinutes(Math.floor(next.getUTCMinutes() / 10) * 10 + 10);
  else if (cron === "0 * * * *")
    next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  else if (cron === "30 0 1 * *") {
    next.setUTCDate(1);
    next.setUTCHours(0, 30, 0, 0);
    if (next <= after) next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    const [minute, hour] = cron.split(" ").map(Number);
    next.setUTCHours(hour!, minute!, 0, 0);
    if (next <= after) next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
