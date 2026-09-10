import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  inboxRepository,
  type InboxChannelFilter,
  type InboxHandlingFilter,
} from "@/lib/db/repos/inbox";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * The inbox READ helpers, and only those.
 *
 * C-2's write lane — reply, take over, assign, close, mark read — lives in
 * `lib/admin/inbox-action-core.ts`, not here, and this file must stay free of
 * anything actor-taking that a `"use server"` module might be tempted to
 * re-export: that directive publishes every export as an HTTP-callable
 * endpoint, and an endpoint whose caller supplies the actor authorizes nothing.
 * The wrappers in `lib/admin/inbox-actions.ts` are the only dispatchable
 * surface, and each resolves its actor from the session.
 */
export async function listInbox(
  actor: Actor,
  channel: InboxChannelFilter,
  handling: InboxHandlingFilter = "all",
) {
  requireAdmin(actor);
  // Both filters go down to the statement, not to a `.filter()` over the result:
  // this read is capped at 100 rows, and a filter applied after the cap answers
  // "handled by a person" with whichever of those threads happened to be among
  // the hundred most recent.
  return inboxRepository.listConversations(actor, {channel, handling, limit: 100});
}

export async function readTranscript(actor: Actor, conversationId: string) {
  requireAdmin(actor);
  return inboxRepository.getTranscript(actor, conversationId);
}

export async function listOpenTasks(actor: Actor) {
  requireAdmin(actor);
  return staffTasksRepository.listOpen(actor);
}
