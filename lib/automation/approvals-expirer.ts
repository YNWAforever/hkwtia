import "server-only";

import type {
  AutomationCronActor,
  AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {
  approvalExpiryRepository,
  type ApprovalExpiryRepository,
} from "@/lib/db/repos/approvals";

const DEFAULT_BATCH_SIZE = 100;

export type ApprovalExpiryJobErrorCode =
  | "APPROVAL_EXPIRY_BATCH_FAILED"
  | "MISSING_REQUESTER_PROFILE";

export type ApprovalExpiryJobSummary = Readonly<{
  scanned: number;
  expired: number;
  auditsCreated: number;
  tasksCreated: number;
  skipped: number;
  errors: Readonly<Partial<Record<ApprovalExpiryJobErrorCode, number>>>;
}>;

export type ApprovalExpiryDependencies = Readonly<{
  approvals: ApprovalExpiryRepository;
  batchSize: number;
}>;

type MutableSummary = {
  scanned: number;
  expired: number;
  auditsCreated: number;
  tasksCreated: number;
  skipped: number;
  errors: Partial<Record<ApprovalExpiryJobErrorCode, number>>;
};

const defaultDependencies: ApprovalExpiryDependencies = {
  approvals: approvalExpiryRepository,
  batchSize: DEFAULT_BATCH_SIZE,
};

function requireCronActor(
  actor: AutomationRepositoryActor,
): asserts actor is AutomationCronActor {
  if (actor.kind !== "system" || actor.source !== "automation-cron") {
    throw new Error("FORBIDDEN");
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function recordError(
  summary: MutableSummary,
  code: ApprovalExpiryJobErrorCode,
  count = 1,
): void {
  summary.errors[code] = (summary.errors[code] ?? 0) + count;
}

export async function expireStaleApprovals(
  actor: AutomationRepositoryActor,
  asOf: Date,
  dependencies: ApprovalExpiryDependencies = defaultDependencies,
): Promise<ApprovalExpiryJobSummary> {
  requireCronActor(actor);
  if (!validDate(asOf)) throw new Error("INVALID_APPROVAL_EXPIRY_AS_OF");
  if (
    !Number.isSafeInteger(dependencies.batchSize)
    || dependencies.batchSize <= 0
    || dependencies.batchSize > 1_000
  ) {
    throw new Error("INVALID_APPROVAL_EXPIRY_BATCH_SIZE");
  }

  const summary: MutableSummary = {
    scanned: 0,
    expired: 0,
    auditsCreated: 0,
    tasksCreated: 0,
    skipped: 0,
    errors: {},
  };

  while (true) {
    let batch;
    try {
      batch = await dependencies.approvals.expirePendingBatch(actor, {
        asOf,
        limit: dependencies.batchSize,
      });
    } catch {
      recordError(summary, "APPROVAL_EXPIRY_BATCH_FAILED");
      break;
    }

    summary.scanned += batch.expired;
    summary.expired += batch.expired;
    summary.auditsCreated += batch.auditsCreated;
    summary.tasksCreated += batch.tasksCreated;
    summary.skipped += batch.missingRequesterProfiles;
    if (batch.missingRequesterProfiles > 0) {
      recordError(
        summary,
        "MISSING_REQUESTER_PROFILE",
        batch.missingRequesterProfiles,
      );
    }
    if (batch.expired < dependencies.batchSize) break;
  }

  return summary;
}
