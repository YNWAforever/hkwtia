import { automationCronActor } from "@/lib/auth/automation-actor";
import { cleanupEventAttendeeArtifacts } from "@/lib/db/repos/batch-handlers/export-event-attendees";
import "server-only";

import { randomUUID } from "node:crypto";

import { batchRuntimeConfig } from "@/lib/admin/batches/types";
import { batchOperationHandlers } from "@/lib/admin/batches/handlers/registry";
import { adminBatchWorkerRepository } from "@/lib/db/repos/admin-batches";
import type {
  BatchHandlerRegistry,
  BatchOperationHandler,
  BatchWorkerRepository,
} from "@/lib/admin/batches/worker-types";

const unsupportedHandler: BatchOperationHandler = {
  async prepare() {
    return [];
  },
  async execute() {
    return { status: "failed", errorCode: "UNSUPPORTED_OPERATION" };
  },
};

/** The runner performs no direct provider I/O. Handlers commit database changes or outbox effects inside executeClaim. */
export async function runAdminBatchJob(
  now: Date,
  options: {
    repository?: BatchWorkerRepository;
    handlers?: BatchHandlerRegistry;
    workerId?: string;
    clock?: () => number;
  } = {},
) {
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const config = batchRuntimeConfig();
  const workerId = options.workerId ?? randomUUID();
  const repository = options.repository ?? adminBatchWorkerRepository;
  const handlers: BatchHandlerRegistry =
    options.handlers ?? batchOperationHandlers;
  await cleanupEventAttendeeArtifacts(automationCronActor(), undefined, now);
  await repository.prepareNext(handlers, now);
  let claimed = 0;
  let settled = 0;
  let failed = 0;
  // Take only the item about to start. Unstarted work stays pending with no lease or consumed attempt.
  while (
    claimed < config.claimSize &&
    clock() - startedAt < config.timeBudgetMs
  ) {
    const claimedAt = new Date(
      now.getTime() + Math.max(0, clock() - startedAt),
    );
    const [claim] = await repository.claimItems(workerId, claimedAt, 1);
    if (!claim) break;
    claimed += 1;
    const handler = handlers[claim.operation] ?? unsupportedHandler;
    try {
      const outcome = await repository.executeClaim(claim, handler, claimedAt);
      if (outcome === "settled") settled += 1;
    } catch {
      // A failed settlement remains fenced and leased. Recovery preserves unknown effects.
      failed += 1;
    }
  }
  return {
    claimed,
    settled,
    failed,
    budgetExhausted: clock() - startedAt >= config.timeBudgetMs,
  };
}
