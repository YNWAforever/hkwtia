import "server-only";
import {sql, type SQL} from "drizzle-orm";
import {requireAdmin} from "@/lib/auth/authorize";
import {
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import type {Actor} from "@/lib/membership/lifecycle";
import {getDb} from "@/lib/db/repos/common";
import {
  jobHealth as table,
  jobs,
  campaignRecipients,
  journeyState,
  messages,
} from "@/lib/db/server-schema";
import {
  assertVerifiedWorkerPoll,
  type VerifiedWorkerPoll,
} from "@/lib/jobs/worker-health-request";
import {
  HEALTH_JOB_KEYS,
  JOB_HEALTH_SCHEDULE,
  type HealthJobKey,
} from "@/lib/jobs/health-registry";
import type {JobHealthSnapshot} from "@/lib/jobs/health";
export type JobPollOutcome = "completed" | "disabled" | "failed" | "uncertain";
export type JobHealthExecutor = Readonly<{
  execute(query: SQL): PromiseLike<unknown>;
}>;
function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  )
    return result.rows;
  throw Error("INVALID_HEALTH_RESULT");
}
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 1000000000)
    : 0;
export function createJobHealthRepository(
  load: () => Promise<JobHealthExecutor> = async () => await getDb(),
) {
  return {
    async start(actor: AutomationRepositoryActor, poll: VerifiedWorkerPoll) {
      requireAutomationCron(actor);
      assertVerifiedWorkerPoll(poll);
      const db = await load();
      await db.execute(sql`INSERT INTO ${table} (job_key,worker_revision,web_revision,poll_id,last_started_at,outcome)
   VALUES(${poll.jobKey},${poll.workerRevision},${poll.webRevision},${poll.pollId}::uuid,${poll.startedAt},'processing')
   ON CONFLICT(job_key) DO UPDATE SET worker_revision=EXCLUDED.worker_revision,web_revision=EXCLUDED.web_revision,poll_id=EXCLUDED.poll_id,last_started_at=EXCLUDED.last_started_at,last_finished_at=NULL,
    last_succeeded_at=CASE WHEN ${table.workerRevision}=EXCLUDED.worker_revision THEN ${table.lastSucceededAt} ELSE NULL END,outcome='processing',elapsed_ms=NULL,error_code=NULL,counts='{}'::jsonb
   WHERE ${table.lastStartedAt}<=EXCLUDED.last_started_at`);
    },
    async finish(
      actor: AutomationRepositoryActor,
      poll: VerifiedWorkerPoll,
      outcome: JobPollOutcome,
      finishedAt: Date,
      summary: Readonly<Record<string, unknown>> = {},
    ) {
      requireAutomationCron(actor);
      assertVerifiedWorkerPoll(poll);
      if (
        !["completed", "disabled", "failed", "uncertain"].includes(outcome) ||
        !Number.isFinite(finishedAt.getTime()) ||
        finishedAt < poll.startedAt
      )
        throw Error("INVALID_POLL_OUTCOME");
      const counters = Object.fromEntries(
        [
          "claimed",
          "processed",
          "settled",
          "sent",
          "skipped",
          "failed",
          "uncertain",
          "removed",
          "expired",
          "scanned",
          "createdSteps",
          "existingSteps",
        ]
          .filter((key) => typeof summary[key] === "number")
          .map((key) => [key, count(summary[key])]),
      );
      const elapsed = Math.min(
          2147483647,
          finishedAt.getTime() - poll.startedAt.getTime(),
        ),
        db = await load();
      return (
        rows(
          await db.execute(sql`UPDATE ${table} SET outcome=${outcome},last_finished_at=${finishedAt},
   last_succeeded_at=CASE WHEN ${outcome}='completed' THEN ${finishedAt} ELSE last_succeeded_at END,elapsed_ms=${elapsed},counts=${JSON.stringify(counters)}::jsonb,
   error_code=CASE WHEN ${outcome}='failed' THEN 'JOB_RUN_FAILED' WHEN ${outcome}='uncertain' THEN 'JOB_OUTCOME_UNCERTAIN' ELSE NULL END
   WHERE job_key=${poll.jobKey} AND poll_id=${poll.pollId}::uuid AND worker_revision=${poll.workerRevision} RETURNING job_key`),
        ).length === 1
      );
    },
    async read(actor: Actor, now: Date): Promise<JobHealthSnapshot[]> {
      requireAdmin(actor);
      if (!Number.isFinite(now.getTime())) throw Error("INVALID_HEALTH_CLOCK");
      const db = await load();
      const values = sql.join(
        HEALTH_JOB_KEYS.map(
          (key) => sql`(${key}::text,${JOB_HEALTH_SCHEDULE[key].graceMs}::int)`,
        ),
        sql`, `,
      );
      const result =
        await db.execute(sql`WITH registry(job_key,grace_ms) AS (VALUES ${values}) SELECT h.*,
   COALESCE((h.counts->>'failed')::bigint,0)+j.failed_count AS failed_count,
   COALESCE((h.counts->>'uncertain')::bigint,0)+j.uncertain_count+q.uncertain_count AS uncertain_count,
   LEAST(j.oldest_pending_at,q.oldest_pending_at) AS oldest_pending_at
   FROM registry r JOIN ${table} h ON h.job_key=r.job_key
   CROSS JOIN LATERAL (SELECT count(*) FILTER(WHERE state='failed') AS failed_count,
    count(*) FILTER(WHERE state='processing' AND (h.outcome='uncertain' OR updated_at<${now}::timestamptz-(r.grace_ms*interval '1 millisecond'))) AS uncertain_count,
    min(created_at) FILTER(WHERE state='processing') AS oldest_pending_at FROM ${jobs} WHERE kind=r.job_key) j
   CROSS JOIN LATERAL (SELECT count(*) FILTER(WHERE uncertain) AS uncertain_count,min(created_at) AS oldest_pending_at FROM (
    SELECT created_at,(error_code='provider_acceptance_uncertain') AS uncertain FROM ${campaignRecipients} WHERE r.job_key='whatsapp-send-queue' AND (status IN ('queued','processing') OR error_code='provider_acceptance_uncertain')
    UNION ALL SELECT scheduled_at AS created_at,(error_code='provider_acceptance_uncertain') AS uncertain FROM ${journeyState} WHERE r.job_key='journey-runner' AND status IN ('scheduled','processing','failed')
    UNION ALL SELECT created_at,true AS uncertain FROM ${messages} WHERE r.job_key='whatsapp-send-queue' AND direction='outbound' AND (
     metadata->'woztellSessionDelivery'->>'state' IN ('reserved','uncertain') OR metadata->'woztellTemplateDelivery'->>'state' IN ('reserved','uncertain'))
   ) pending) q`);
      return rows(result).map((row) => ({
        jobKey: row.job_key as HealthJobKey,
        workerRevision: String(row.worker_revision),
        lastStartedAt: new Date(String(row.last_started_at)),
        lastSucceededAt: row.last_succeeded_at
          ? new Date(String(row.last_succeeded_at))
          : null,
        outcome: String(row.outcome),
        failedCount: Number(row.failed_count),
        uncertainCount: Number(row.uncertain_count),
        oldestPendingAt: row.oldest_pending_at
          ? new Date(String(row.oldest_pending_at))
          : null,
      }));
    },
  };
}
export const jobHealthRepository = createJobHealthRepository();
