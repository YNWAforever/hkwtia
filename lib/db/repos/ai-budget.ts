import "server-only";
import {requireAdmin} from "@/lib/auth/authorize";
import {forbidden,type AdminActor} from "@/lib/membership/lifecycle";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {AI_PRICING_VERSION} from "@/config/ai-pricing";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
export type AiBudgetRequest = Readonly<{
  runKey: string;
  scope: string;
  maxCostMicrousd: number;
  expiresAt: string;
}>;
export type AiSettlement = Readonly<
  | {reservationId: string; usageState: "known"; actualMicrousd: number}
  | {reservationId: string; usageState: "unknown"; actualMicrousd: null}
>;
export type AiBudgetLimits = Readonly<{
  runMicrousd: number;
  dayMicrousd: number;
  monthMicrousd: number;
}>;
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requestSchema = z
  .object({
    runKey: z.string().uuid(),
    scope: z.enum([
      "concierge",
      "writer",
      "application",
      "support",
      "renewal",
      "board",
      "content",
      "evaluation",
      "embedding",
      "judge",
    ]),
    maxCostMicrousd: amount,
    expiresAt: z.string().datetime({offset: true}),
  })
  .strict();
const settlementSchema = z.discriminatedUnion("usageState", [
  z
    .object({
      reservationId: z.string().uuid(),
      usageState: z.literal("known"),
      actualMicrousd: amount,
    })
    .strict(),
  z
    .object({
      reservationId: z.string().uuid(),
      usageState: z.literal("unknown"),
      actualMicrousd: z.null(),
    })
    .strict(),
]);
function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  )
    return result.rows as Record<string, unknown>[];
  throw Error("AI_BUDGET_SQL_RESULT_INVALID");
}
function validLimits(limits: AiBudgetLimits | null): limits is AiBudgetLimits {
  return (
    limits !== null &&
    [limits.runMicrousd, limits.dayMicrousd, limits.monthMicrousd].every(
      (v) => Number.isSafeInteger(v) && v > 0,
    )
  );
}
/** No financial defaults: an owner must configure all caps in micro-USD before activation. */
export function configuredAiBudgetLimits(
  env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): AiBudgetLimits | null {
  const parse = (name: string) => {
    const raw = env[name];
    return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  };
  const limits = {
    runMicrousd: parse("AI_BUDGET_RUN_MICROUSD"),
    dayMicrousd: parse("AI_BUDGET_DAY_MICROUSD"),
    monthMicrousd: parse("AI_BUDGET_MONTH_MICROUSD"),
  };
  return validLimits(limits) ? limits : null;
}
export function createAiBudgetRepository(
  load: AutomationDatabaseLoader = async () =>
    (await getDb()) as unknown as AutomationDatabase,
  limits: () => AiBudgetLimits | null = configuredAiBudgetLimits,
  now: () => Date = () => new Date(),
) {
  async function locked<T>(
    callback: (tx: Pick<AutomationDatabase, "execute">) => Promise<T>,
  ): Promise<T> {
    const database = await load();
    return database.transaction(async (tx) => {
      // Every category, day/month admission and settlement shares this lock, including first creation.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('hkwtia-ai-budget-v1',0))`,
      );
      return callback(tx);
    });
  }
  async function existing(tx: Pick<AutomationDatabase, "execute">, id: string) {
    const row = rows(
      await tx.execute(
        sql`SELECT * FROM ai_budget_reservations WHERE id=${z.string().uuid().parse(id)} FOR UPDATE`,
      ),
    )[0];
    if (!row) throw Error("AI_BUDGET_RESERVATION_MISSING");
    return row;
  }
  return {
    async reserveAiBudget(
      input: AiBudgetRequest,
    ): Promise<
      | {ok: true; reservationId: string}
      | {ok: false; reason: "BUDGET_EXCEEDED" | "CONFIG_MISSING"}
    > {
      const parsed = requestSchema.parse(input),
        caps = limits(),
        at = now(),
        expiry = new Date(parsed.expiresAt);
      if (!Number.isFinite(at.getTime()) || expiry <= at)
        throw Error("AI_BUDGET_EXPIRY_INVALID");
      if (!validLimits(caps)) return {ok: false, reason: "CONFIG_MISSING"};
      return locked(async (tx) => {
        const control = rows(
          await tx.execute(
            sql`SELECT halted FROM ai_budget_control WHERE id=true FOR UPDATE`,
          ),
        )[0];
        if (!control) throw Error("AI_BUDGET_CONTROL_MISSING");
        const prior = rows(
          await tx.execute(
            sql`SELECT * FROM ai_budget_reservations WHERE run_key=${parsed.runKey} FOR UPDATE`,
          ),
        )[0];
        if (prior) {
          if (
            String(prior.scope) !== parsed.scope ||
            BigInt(String(prior.max_microusd)) !==
              BigInt(parsed.maxCostMicrousd) ||
            new Date(String(prior.expires_at)).getTime() !== expiry.getTime()
          )
            throw Error("AI_BUDGET_RUN_KEY_CONFLICT");
          // A repeated admission is never a permit to dispatch a second request.
          if (
            prior.dispatched_at ||
            prior.usage_state !== "held" ||
            control.halted
          )
            return {ok: false, reason: "BUDGET_EXCEEDED"};
          return {ok: true, reservationId: String(prior.id)};
        }
        if (control.halted || parsed.maxCostMicrousd > caps.runMicrousd)
          return {ok: false, reason: "BUDGET_EXCEEDED"};
        const day = new Date(at);
        day.setUTCHours(0, 0, 0, 0);
        const month = new Date(day);
        month.setUTCDate(1);
        // Unresolved liabilities carry into future periods. TTL never creates a refund.
        const totals = rows(
          await tx.execute(sql`SELECT
    COALESCE(SUM(charged_microusd) FILTER(WHERE created_at>=${day} OR usage_state IN ('held','unknown')),0)::text AS day,
    COALESCE(SUM(charged_microusd) FILTER(WHERE created_at>=${month} OR usage_state IN ('held','unknown')),0)::text AS month
    FROM ai_budget_reservations`),
        )[0]!;
        if (
          BigInt(String(totals.day)) + BigInt(parsed.maxCostMicrousd) >
            BigInt(caps.dayMicrousd) ||
          BigInt(String(totals.month)) + BigInt(parsed.maxCostMicrousd) >
            BigInt(caps.monthMicrousd)
        )
          return {ok: false, reason: "BUDGET_EXCEEDED"};
        const inserted = rows(
          await tx.execute(sql`INSERT INTO ai_budget_reservations(run_key,scope,max_microusd,charged_microusd,pricing_version,expires_at,created_at,updated_at)
    VALUES(${parsed.runKey},${parsed.scope},${parsed.maxCostMicrousd},${parsed.maxCostMicrousd},${AI_PRICING_VERSION},${expiry},${at},${at}) RETURNING id`),
        )[0]!;
        return {ok: true, reservationId: String(inserted.id)};
      });
    },
    async markDispatched(
      id: string,
      providerRequestId?: string,
    ): Promise<void> {
      const receipt =
        providerRequestId === undefined
          ? null
          : z
              .string()
              .regex(/^[A-Za-z0-9_.:-]{1,200}$/)
              .parse(providerRequestId);
      await locked(async (tx) => {
        const row = await existing(tx, id),
          at = now();
        if (
          row.dispatched_at ||
          row.usage_state !== "held" ||
          new Date(String(row.expires_at)) <= at
        )
          throw Error("AI_BUDGET_DISPATCH_ALREADY_STARTED");
        const control = rows(
          await tx.execute(
            sql`SELECT halted FROM ai_budget_control WHERE id=true`,
          ),
        )[0];
        if (control?.halted) throw Error("AI_BUDGET_HALTED");
        await tx.execute(
          sql`UPDATE ai_budget_reservations SET dispatched_at=${at},provider_request_id=${receipt},updated_at=${at} WHERE id=${id}`,
        );
      });
    },
    async recordProviderReceipt(id: string, requestId: string): Promise<void> {
      const receipt = z
        .string()
        .regex(/^[A-Za-z0-9_.:-]{1,200}$/)
        .parse(requestId);
      await locked(async (tx) => {
        const row = await existing(tx, id);
        if (!row.dispatched_at) throw Error("AI_BUDGET_NOT_DISPATCHED");
        await tx.execute(sql`INSERT INTO ai_budget_provider_receipts(reservation_id,provider_request_id,observed_at)
    VALUES(${id},${receipt},${now()}) ON CONFLICT DO NOTHING`);
        await tx.execute(
          sql`UPDATE ai_budget_reservations SET accepted_at=COALESCE(accepted_at,${now()}),provider_request_id=COALESCE(provider_request_id,${receipt}),updated_at=${now()} WHERE id=${id}`,
        );
      });
    },
    async settleAiBudget(input: AiSettlement): Promise<void> {
      const parsed = settlementSchema.parse(input);
      await locked(async (tx) => {
        const row = await existing(tx, parsed.reservationId);
        if (!row.dispatched_at || row.usage_state === "released")
          throw Error("AI_BUDGET_NOT_DISPATCHED");
        if (row.usage_state === "known") {
          if (
            parsed.usageState === "known" &&
            BigInt(String(row.actual_microusd)) ===
              BigInt(parsed.actualMicrousd)
          )
            return;
          throw Error("AI_BUDGET_SETTLEMENT_CONFLICT");
        }
        if (parsed.usageState === "unknown") {
          await tx.execute(
            sql`UPDATE ai_budget_reservations SET usage_state='unknown',updated_at=${now()} WHERE id=${parsed.reservationId}`,
          );
          return;
        }
        // Record full actual spend, even over the reservation. Stop new work atomically.
        await tx.execute(
          sql`UPDATE ai_budget_reservations SET usage_state='known',actual_microusd=${parsed.actualMicrousd},charged_microusd=${parsed.actualMicrousd},updated_at=${now()} WHERE id=${parsed.reservationId}`,
        );
        if (BigInt(parsed.actualMicrousd) > BigInt(String(row.max_microusd)))
          await tx.execute(
            sql`UPDATE ai_budget_control SET halted=true,reason_code='actual_exceeds_reservation',updated_at=${now()} WHERE id=true`,
          );
      });
    },
    async readRemainingDay(actor:AdminActor,asOf=new Date()):Promise<number|null>{
      requireAdmin(actor);const caps=limits();if(!validLimits(caps))return null;
      const db=await load(),day=new Date(asOf);day.setUTCHours(0,0,0,0);
      return db.transaction(async tx=>{
        if(rows(await tx.execute(sql`SELECT id FROM profiles WHERE id=${actor.profileId} AND auth_user_id=${actor.userId} AND role=${actor.kind} FOR SHARE`)).length!==1)forbidden();
        const spent=BigInt(String(rows(await tx.execute(sql`SELECT COALESCE(SUM(charged_microusd) FILTER(WHERE created_at>=${day} OR usage_state IN ('held','unknown')),0)::text AS spent FROM ai_budget_reservations`))[0]?.spent));
        return Number(BigInt(caps.dayMicrousd)>spent?BigInt(caps.dayMicrousd)-spent:0n);
      });
    },
    async releaseUndispatched(id: string): Promise<void> {
      await locked(async (tx) => {
        const row = await existing(tx, id);
        if (row.dispatched_at)
          throw Error("AI_BUDGET_DISPATCH_ALREADY_STARTED");
        if (row.usage_state === "released") return;
        if (row.usage_state !== "held")
          throw Error("AI_BUDGET_SETTLEMENT_CONFLICT");
        await tx.execute(
          sql`UPDATE ai_budget_reservations SET usage_state='released',charged_microusd=0,updated_at=${now()} WHERE id=${id}`,
        );
      });
    },
  };
}
export const aiBudgetRepository = createAiBudgetRepository();
export const reserveAiBudget = aiBudgetRepository.reserveAiBudget;
export const settleAiBudget = aiBudgetRepository.settleAiBudget;
