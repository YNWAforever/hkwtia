import {randomUUID} from "node:crypto";
import {vi} from "vitest";
import type {AiBudgetPort} from "@/lib/ai/budget";
/** Explicit unit-test ledger double, never a provider or database acceptance receipt. */
export function syntheticAiBudget(): AiBudgetPort {
  return {
    reserveAiBudget: vi.fn(async () => ({
      ok: true as const,
      reservationId: randomUUID(),
    })),
    markDispatched: vi.fn(async () => {}),
    releaseUndispatched: vi.fn(async () => {}),
    settleAiBudget: vi.fn(async () => {}),
  };
}
