import "server-only";

import {subMonths} from "date-fns";

import {
  chatRetentionRepository,
  type ChatRetentionRepository,
} from "@/lib/db/repos/chat-retention";

export {
  createChatRetentionRepository,
  type ChatRetentionInspection,
  type ChatRetentionRepository,
  type EmptyConversationBatch,
} from "@/lib/db/repos/chat-retention";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 100;
const MAX_BATCH_SIZE = 1_000;
const MAX_BATCHES = 1_000;

export type ChatRetentionResult = Readonly<{
  dryRun: boolean;
  messagesDeleted: number;
  runsRedacted: number;
  runsUnlinked: number;
  conversationsDeleted: number;
  batches: number;
  truncated: boolean;
}>;

type RunChatRetentionOptions = Readonly<{
  repository: ChatRetentionRepository;
  now: Date;
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
}>;

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (
    !Number.isSafeInteger(resolved)
    || resolved < 1
    || resolved > maximum
  ) {
    throw new Error("INVALID_RETENTION_CONFIGURATION");
  }
  return resolved;
}

export function chatRetentionCutoff(now: Date): Date {
  if (!validDate(now)) throw new Error("INVALID_RETENTION_CLOCK");
  return subMonths(now, 12);
}

export async function runChatRetention(
  options: RunChatRetentionOptions,
): Promise<ChatRetentionResult> {
  if (!validDate(options.now)) throw new Error("INVALID_RETENTION_CLOCK");
  const batchSize = boundedInteger(
    options.batchSize,
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
  );
  const maxBatches = boundedInteger(
    options.maxBatches,
    DEFAULT_MAX_BATCHES,
    MAX_BATCHES,
  );
  const cutoff = chatRetentionCutoff(options.now);

  if (options.dryRun === true) {
    const inspected = await options.repository.inspect(cutoff, options.now);
    return {
      dryRun: true,
      messagesDeleted: inspected.messages,
      runsRedacted: inspected.runsToRedact,
      runsUnlinked: inspected.runsToUnlink,
      conversationsDeleted: inspected.emptyConversations,
      batches: 0,
      truncated: false,
    };
  }

  let messagesDeleted = 0;
  let runsRedacted = 0;
  let runsUnlinked = 0;
  let conversationsDeleted = 0;
  let batches = 0;
  let truncated = false;

  const hasBudget = () => batches < maxBatches;

  while (hasBudget()) {
    const count = await options.repository.redactRunsBatch(cutoff, batchSize);
    batches += 1;
    runsRedacted += count;
    if (count < batchSize) break;
  }
  if (!hasBudget()) truncated = true;

  while (!truncated && hasBudget()) {
    const count = await options.repository.deleteMessagesBatch(
      cutoff,
      batchSize,
    );
    batches += 1;
    messagesDeleted += count;
    if (count < batchSize) break;
  }
  if (!hasBudget()) truncated = true;

  while (!truncated && hasBudget()) {
    const batch = await options.repository.removeEmptyConversationsBatch(
      options.now,
      batchSize,
    );
    batches += 1;
    conversationsDeleted += batch.conversationsDeleted;
    runsUnlinked += batch.runsUnlinked;
    runsRedacted += batch.runsRedacted;
    if (batch.conversationsDeleted < batchSize) break;
  }
  if (!hasBudget()) truncated = true;

  return {
    dryRun: false,
    messagesDeleted,
    runsRedacted,
    runsUnlinked,
    conversationsDeleted,
    batches,
    truncated,
  };
}

export {chatRetentionRepository};
