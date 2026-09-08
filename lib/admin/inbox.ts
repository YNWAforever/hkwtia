import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {inboxRepository, type InboxChannelFilter} from "@/lib/db/repos/inbox";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {Actor} from "@/lib/membership/lifecycle";

export async function listInbox(actor: Actor, channel: InboxChannelFilter) {
  requireAdmin(actor);
  return inboxRepository.listConversations(actor, {channel, limit: 100});
}

export async function readTranscript(actor: Actor, conversationId: string) {
  requireAdmin(actor);
  return inboxRepository.getTranscript(actor, conversationId);
}

export async function listOpenTasks(actor: Actor) {
  requireAdmin(actor);
  return staffTasksRepository.listOpen(actor);
}
