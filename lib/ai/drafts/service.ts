import "server-only";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import type { Actor } from "@/lib/membership/lifecycle";
/** Review records a transactionally revalidated decision. It never approves membership, sends or publishes. */
export function reviewDraft(
  actor: Actor,
  input: Parameters<typeof aiDraftsRepository.reviewDraft>[1],
) {
  return aiDraftsRepository.reviewDraft(actor, input);
}
/** Existing business services provide the authorized, idempotent outbox/write callback; providers never execute inside this transaction. */
export function adoptDraft<T>(
  actor: Actor,
  input: unknown,
  adopt: Parameters<typeof aiDraftsRepository.withApprovedDraft<T>>[2],
) {
  return aiDraftsRepository.withApprovedDraft(actor, input, adopt);
}
