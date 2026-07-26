import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import type {AutomationDashboard} from "@/lib/admin/automations";
import {requireAdmin} from "@/lib/auth/actor";
import {jobs as jobsTable, journeyState} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import {journeysRepository} from "@/lib/db/repos/journeys";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export const AUTOMATION_JOB_LIMIT = 10;

export type AutomationAdminExecutor = Readonly<{
  execute: (query: SQL) => PromiseLike<unknown>;
}>;

type AutomationAdminExecutorLoader = () => Promise<AutomationAdminExecutor>;
type RetryFailedJourney = (
  actor: AdminActor,
  journeyId: string,
  scheduledAt: Date,
) => Promise<unknown>;

export type AutomationDashboardRepositoryQuery = Readonly<{
  asOf: Date;
  cursor: string | null;
  limit: number;
}>;

const countsRowSchema = z.object({
  due: z.coerce.number().int().nonnegative(),
  upcoming: z.coerce.number().int().nonnegative(),
  failed: z.coerce.number().int().nonnegative(),
  processing: z.coerce.number().int().nonnegative(),
});

const jobRowSchema = z.object({
  kind: z.string(),
  state: z.string(),
  updated_at: z.coerce.date(),
  error_code: z.string().nullable(),
});

const journeyRowSchema = z.object({
  id: z.string().uuid(),
  journey: z.string(),
  step: z.string(),
  status: z.string(),
  scheduled_at: z.coerce.date(),
  attempt_count: z.coerce.number().int().nonnegative(),
  error_code: z.string().nullable(),
});

const cursorSchema = z.object({
  scheduledAt: z.string().datetime({offset: true}),
  id: z.string().uuid(),
}).strict();

const journeyIdSchema = z.string().uuid();
const SAFE_CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;
const JOB_STATES = new Set(["processing", "completed", "failed"]);
const JOURNEY_STATES = new Set([
  "scheduled",
  "processing",
  "sent",
  "skipped",
  "failed",
]);

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  return [];
}

function safeCode(value: string | null): string | null {
  return value !== null && SAFE_CODE.test(value) ? value : null;
}

function safeRequiredCode(value: string): string {
  return safeCode(value) ?? "unknown";
}

function encodeCursor(row: Readonly<{scheduledAt: string; id: string}>): string {
  return Buffer.from(JSON.stringify(row), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): Readonly<{
  scheduledAt: Date;
  id: string;
}> | null {
  if (value === null) return null;
  if (value.length === 0 || value.length > 512) {
    throw new Error("INVALID_AUTOMATION_CURSOR");
  }
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return {scheduledAt: new Date(parsed.scheduledAt), id: parsed.id};
  } catch {
    throw new Error("INVALID_AUTOMATION_CURSOR");
  }
}

function validateQuery(
  query: AutomationDashboardRepositoryQuery,
): Readonly<{
  asOf: Date;
  cursor: ReturnType<typeof decodeCursor>;
  limit: number;
}> {
  if (
    Number.isNaN(query.asOf.getTime())
    || !Number.isInteger(query.limit)
    || query.limit < 1
    || query.limit > 50
  ) {
    throw new Error("INVALID_AUTOMATION_QUERY");
  }
  return {
    asOf: query.asOf,
    cursor: decodeCursor(query.cursor),
    limit: query.limit,
  };
}

async function defaultExecutorLoader(): Promise<AutomationAdminExecutor> {
  return await getDb();
}

const defaultRetryFailedJourney: RetryFailedJourney = async (
  actor,
  journeyId,
  scheduledAt,
) => journeysRepository.retryFailed(actor, journeyId, scheduledAt);

export function createAutomationAdminRepository(
  loadExecutor: AutomationAdminExecutorLoader = defaultExecutorLoader,
  dependencies: Readonly<{
    retryFailedJourney?: RetryFailedJourney;
  }> = {},
) {
  const retryFailedJourney = dependencies.retryFailedJourney
    ?? defaultRetryFailedJourney;

  return {
    async getDashboard(
      actor: Actor,
      input: AutomationDashboardRepositoryQuery,
    ): Promise<AutomationDashboard> {
      requireAdmin(actor);
      const query = validateQuery(input);
      const executor = await loadExecutor();
      const countRows = z.array(countsRowSchema).parse(resultRows(
        await executor.execute(sql`
          SELECT
            COUNT(*) FILTER (
              WHERE ${journeyState.status} = 'scheduled'
                AND ${journeyState.scheduledAt} <= ${query.asOf}
            )::int AS due,
            COUNT(*) FILTER (
              WHERE ${journeyState.status} = 'scheduled'
                AND ${journeyState.scheduledAt} > ${query.asOf}
            )::int AS upcoming,
            COUNT(*) FILTER (
              WHERE ${journeyState.status} = 'failed'
            )::int AS failed,
            COUNT(*) FILTER (
              WHERE ${journeyState.status} = 'processing'
            )::int AS processing
          FROM ${journeyState}
        `),
      ));
      const counts = countRows[0] ?? {
        due: 0,
        upcoming: 0,
        failed: 0,
        processing: 0,
      };

      const jobRows = z.array(jobRowSchema).parse(resultRows(
        await executor.execute(sql`
          SELECT
            ${jobsTable.kind} AS kind,
            ${jobsTable.state} AS state,
            ${jobsTable.updatedAt} AS updated_at,
            ${jobsTable.lastError} AS error_code
          FROM ${jobsTable}
          ORDER BY ${jobsTable.updatedAt} DESC, ${jobsTable.id} DESC
          LIMIT ${AUTOMATION_JOB_LIMIT}
        `),
      ));

      const afterCursor = query.cursor
        ? sql`WHERE (
            ${journeyState.scheduledAt} < ${query.cursor.scheduledAt}
            OR (
              ${journeyState.scheduledAt} = ${query.cursor.scheduledAt}
              AND ${journeyState.id} < ${query.cursor.id}
            )
          )`
        : sql``;
      const journeyRows = z.array(journeyRowSchema).parse(resultRows(
        await executor.execute(sql`
          SELECT
            ${journeyState.id} AS id,
            ${journeyState.journey} AS journey,
            ${journeyState.step} AS step,
            ${journeyState.status} AS status,
            ${journeyState.scheduledAt} AS scheduled_at,
            ${journeyState.attemptCount} AS attempt_count,
            ${journeyState.errorCode} AS error_code
          FROM ${journeyState}
          ${afterCursor}
          ORDER BY ${journeyState.scheduledAt} DESC, ${journeyState.id} DESC
          LIMIT ${query.limit + 1}
        `),
      ));
      const hasNextPage = journeyRows.length > query.limit;
      const rows = journeyRows.slice(0, query.limit).map((row) => {
        const status = JOURNEY_STATES.has(row.status)
          ? row.status
          : "unknown";
        return {
          id: row.id,
          journey: safeRequiredCode(row.journey),
          step: safeRequiredCode(row.step),
          status,
          scheduledAt: row.scheduled_at.toISOString(),
          attemptCount: row.attempt_count,
          errorCode: safeCode(row.error_code),
          retryable: status === "failed",
        };
      });
      const lastRow = rows.at(-1);

      return {
        asOf: query.asOf.toISOString(),
        counts,
        jobs: jobRows.map((row) => ({
          kind: safeRequiredCode(row.kind),
          state: JOB_STATES.has(row.state) ? row.state : "unknown",
          updatedAt: row.updated_at.toISOString(),
          errorCode: safeCode(row.error_code),
        })),
        rows,
        nextCursor: hasNextPage && lastRow
          ? encodeCursor({
              scheduledAt: lastRow.scheduledAt,
              id: lastRow.id,
            })
          : null,
      };
    },

    async retryFailed(
      actor: Actor,
      journeyId: string,
      scheduledAt: Date,
    ): Promise<Readonly<{
      id: string;
      status: string;
      errorCode: string | null;
    }>> {
      requireAdmin(actor);
      const id = journeyIdSchema.parse(journeyId);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error("INVALID_AUTOMATION_RETRY");
      }
      const result = await retryFailedJourney(actor, id, scheduledAt);
      const record = z.object({
        id: z.string(),
        status: z.string(),
        errorCode: z.string().nullable().optional(),
        error_code: z.string().nullable().optional(),
      }).passthrough().parse(result);
      return {
        id: record.id,
        status: record.status,
        errorCode: record.errorCode ?? record.error_code ?? null,
      };
    },
  };
}

export type AutomationAdminRepository = ReturnType<
  typeof createAutomationAdminRepository
>;
export const automationAdminRepository = createAutomationAdminRepository();
