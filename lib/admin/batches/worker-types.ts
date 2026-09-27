import type {BatchRequest, BatchOperation, BatchTarget, BatchPreviewItem} from "@/lib/admin/batches/types";
import type {AdminActor} from "@/lib/membership/lifecycle";
import type {BatchExecutor} from "@/lib/db/repos/admin-batches";

export type BatchClaim = Readonly<{itemId: string; batchId: string; operation: BatchOperation; actorProfileId: string; request: BatchRequest; target: BatchTarget; expectedVersion: string; effectKey: string; attemptCount: number; leaseOwner: string; leaseToken: number}>;
export type BatchItemOutcome = Readonly<{status: "succeeded"; resultRef: string | null}> | Readonly<{status: "skipped"; reasonCode: string}> | Readonly<{status: "retryable" | "failed"; errorCode: string}>;
export type BatchOperationHandler = Readonly<{prepare: (actor: AdminActor, request: BatchRequest, tx: BatchExecutor) => Promise<readonly BatchPreviewItem[]>; execute: (actor: AdminActor, claim: BatchClaim, tx: BatchExecutor) => Promise<BatchItemOutcome>}>;
export type BatchHandlerRegistry = Partial<Readonly<Record<BatchOperation, BatchOperationHandler>>>;
export type BatchWorkerRepository = Readonly<{prepareNext: (handlers: BatchHandlerRegistry, now: Date) => Promise<boolean>; claimItems: (workerId: string, now: Date, limit: number) => Promise<readonly BatchClaim[]>; executeClaim: (claim: BatchClaim, handler: BatchOperationHandler, now: Date) => Promise<"settled" | "stale">}>;
