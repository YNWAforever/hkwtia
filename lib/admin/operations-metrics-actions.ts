"use server";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {operationBaselineWindowSchema, operationObservationSchema} from "@/lib/ai/operations-metrics";
import {operationsMetricsRepository} from "@/lib/db/repos/operations-metrics";
export async function recordOperationObservationAction(input: unknown): Promise<{status: "saved" | "invalid" | "unavailable" | "forbidden"}> {
  try {
    const actor = await requireAdminActor();
    const parsed = operationObservationSchema.safeParse(input);
    if (!parsed.success) return {status: "invalid"};
    await operationsMetricsRepository.record(actor, parsed.data);
    return {status: "saved"};
  } catch (error) {
    if (isAuthorizationDenial(error)) return {status: "forbidden"};
    if (error instanceof Error && /^(OPERATION_SOURCE_MISMATCH|OPERATION_TIME_INVALID|OPERATION_OBSERVATION_CONFLICT|OPERATION_TIMING_OVERLAP|OPERATION_BASELINE_FROZEN)$/.test(error.message)) return {status: "invalid"};
    return {status: "unavailable"};
  }
}

export async function freezeOperationBaselineAction(input: unknown): Promise<{status: "saved" | "invalid" | "unavailable" | "forbidden"}> {
  try {
    const actor = await requireAdminActor();
    const parsed = operationBaselineWindowSchema.safeParse(input);
    if (!parsed.success) return {status: "invalid"};
    await operationsMetricsRepository.freezeBaseline(actor, parsed.data);
    return {status: "saved"};
  } catch (error) {
    if (isAuthorizationDenial(error)) return {status: "forbidden"};
    if (error instanceof Error && /^(OPERATION_BASELINE_INVALID|OPERATION_BASELINE_CONFLICT|OPERATION_BASELINE_INCOMPLETE)$/.test(error.message)) return {status: "invalid"};
    return {status: "unavailable"};
  }
}
