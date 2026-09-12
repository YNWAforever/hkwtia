"use server";

import {notFound} from "next/navigation";

import {
  assignInboxConversation,
  closeInboxConversation,
  inboxReplyErrorCode,
  markInboxRead,
  sendInboxReply,
  setInboxHandling,
  type InboxReplyState,
} from "@/lib/admin/inbox-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

// Every export here is an HTTP-callable endpoint, so each one resolves its own
// actor from the session. The actor-taking cores live in
// lib/admin/inbox-action-core.ts precisely so they cannot be dispatched
// directly, and no parameter below may be named `actor`, `_actor`,
// `adminActor` or `sessionActor` whatever its type —
// tests/unit/server-action-actor-boundary.test.ts flags those names as well as
// the `Actor` type. Every runtime export must also be a provably-async
// function, so the error-code list, `CUSTOMER_SERVICE_WINDOW_MS` and every
// other constant stay in the core module.

/**
 * The one field name a template variable may arrive under.
 *
 * A prefix rather than a JSON blob in a hidden input: a JSON blob is a parser
 * at a trust boundary, and every value here is bound for a WhatsApp template
 * body parameter. Unprefixed fields are the action's own controls and are never
 * forwarded, so a hand-posted `conversationId` cannot become a variable.
 */
const VARIABLE_PREFIX = "variable.";

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function templateVariables(formData: FormData): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(VARIABLE_PREFIX) || typeof value !== "string") continue;
    variables[name.slice(VARIABLE_PREFIX.length)] = value;
  }
  return variables;
}

/**
 * A refused send is a state the composer renders through
 * `Admin.inbox.errors.*`, not a thrown 500 — staff need to know which gate said
 * no. An authorization denial is the exception and still 404s, so this action
 * leaks no more about the admin surface than any other.
 */
export async function sendInboxReplyAction(
  path: string,
  state: InboxReplyState,
  formData: FormData,
): Promise<InboxReplyState> {
  void state;
  try {
    const who = await requireAdminActor();
    const result = await sendInboxReply(who, {
      conversationId: text(formData, "conversationId"),
      kind: text(formData, "kind"),
      content: text(formData, "content"),
      templateKey: text(formData, "templateKey"),
      templateVariables: templateVariables(formData),
      // The composer's per-attempt token. Unprefixed, so it is one of the
      // action's own controls and can never arrive as a template variable.
      attemptId: text(formData, "attemptId"),
    });
    revalidateAdminPath(path);
    // `result.status` VERBATIM, never flattened to "sent". C-2: the two statuses
    // are the difference between a reply the adapter took and one it was never
    // handed because a row under the same `outbound_key` had already settled.
    // Collapsed to "sent" the composer rendered `Admin.inbox.compose.sent` and
    // cleared the draft for a message the member never received — a dropped
    // reply that looked, to the only person who could have noticed, like a
    // success.
    return {status: result.status, messageId: result.messageId};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    const code = inboxReplyErrorCode(error);
    if (code) return {status: "error", code};
    throw error;
  }
}

export async function setInboxHandlingAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await setInboxHandling(who, text(formData, "conversationId"), text(formData, "handling"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function assignInboxConversationAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await assignInboxConversation(who, text(formData, "conversationId"), text(formData, "assignedToProfileId"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function markInboxReadAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await markInboxRead(who, text(formData, "conversationId"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function closeInboxConversationAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await closeInboxConversation(who, text(formData, "conversationId"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
