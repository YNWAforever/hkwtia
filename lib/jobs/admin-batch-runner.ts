import "server-only";

import {randomUUID} from "node:crypto";

import {batchRuntimeConfig} from "@/lib/admin/batches/types";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {adminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import type {BatchHandlerRegistry, BatchOperationHandler, BatchWorkerRepository} from "@/lib/admin/batches/worker-types";

const unsupportedHandler: BatchOperationHandler = {
  async prepare() {return [];},
  async execute() {return {status: "failed", errorCode: "UNSUPPORTED_OPERATION"};},
};

/** The runner performs no direct provider I/O. Handlers commit database changes or outbox effects inside executeClaim. */
export async function runAdminBatchJob(now: Date, options: {repository?: BatchWorkerRepository; handlers?: BatchHandlerRegistry; workerId?: string} = {}) {
  const workerId = options.workerId ?? randomUUID();
  const repository = options.repository ?? adminBatchWorkerRepository;
  const handlers: BatchHandlerRegistry = options.handlers ?? batchOperationHandlers;
  await repository.prepareNext(handlers, now);
  const claims = await repository.claimItems(workerId, now, batchRuntimeConfig().claimSize);
  let settled = 0;
  let failed = 0;
  for (const claim of claims) {
    const handler = handlers[claim.operation] ?? unsupportedHandler;
    try {
      const outcome = await repository.executeClaim(claim, handler, now);
      if (outcome === "settled") settled += 1;
    } catch {
      // A failed settlement remains leased, so the next tick reclaims it after expiry.
      // Continue other claims and expose the failure count to the authenticated job route.
      failed += 1;
    }
  }
  return {claimed: claims.length, settled, failed};
}
